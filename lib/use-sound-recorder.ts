"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SHADOWING_SOUNDS_MAX_SECONDS } from "./limits";
import { SOUNDS_SAMPLE_RATE, downsample, encodeWav, mixToMono } from "./wav";

// Keeps the sound of one spoken attempt, for Shadowing's sounds check
// (item 10). The browser's speech recognition hands back words and throws
// the sound away; this keeps the sound, in memory only, alongside it.
//
// Recorded with the browser's own MediaRecorder in whatever it records
// natively, then decoded and turned into 16 kHz mono WAV when it stops
// (lib/wav.ts). Nothing is stored: not on the server, not in the browser's
// storage. A new recording replaces the last one, leaving the page throws
// it away, and so does clear().
//
// It never stands in the way of the rest of the page. If the browser can't
// record, permission is refused, or decoding fails, there is simply no
// sound to check, and the text check carries on as before.

export interface RecordedSound {
    wav: Uint8Array<ArrayBuffer>;
    seconds: number;
    // The loudest sample, from 0 to 1. A recording that is all but silent is
    // not worth sending: a model asked what it heard in silence may answer
    // with the sentence it was given (Question 46).
    peak: number;
}

export interface UseSoundRecorder {
    supported: boolean;
    recording: boolean;
    // Stopped, and being turned into the WAV file that is sent — a moment
    // during which there is no sound yet, though one is coming. Lets the
    // page tell "not ready yet" apart from "there won't be one".
    preparing: boolean;
    sound: RecordedSound | null;
    // Longer than SHADOWING_SOUNDS_MAX_SECONDS: recording stopped there, and
    // the sound isn't offered for checking — half a sentence would be judged
    // as if the other half had been left out.
    tooLong: boolean;
    start: () => void;
    stop: () => void;
    clear: () => void;
}

const subscribeToNothing = () => () => {};
const readSupportedOnClient = () =>
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof window.OfflineAudioContext !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
const readSupportedOnServer = () => false;

const release = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

// Decoded straight to 16 kHz where the browser allows it — decoding through
// a context of that rate resamples as it goes. Where it doesn't, decoded at
// the usual rate and brought down by hand.
async function toWav(blob: Blob): Promise<RecordedSound> {
    const data = await blob.arrayBuffer();
    let decoded: AudioBuffer;
    try {
        decoded = await new OfflineAudioContext(1, 1, SOUNDS_SAMPLE_RATE).decodeAudioData(data.slice(0));
    } catch {
        const context = new AudioContext();
        try {
            decoded = await context.decodeAudioData(data.slice(0));
        } finally {
            void context.close();
        }
    }
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const samples = downsample(mixToMono(channels), decoded.sampleRate, SOUNDS_SAMPLE_RATE);
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    return { wav: encodeWav(samples, SOUNDS_SAMPLE_RATE), seconds: decoded.duration, peak };
}

export function useSoundRecorder(): UseSoundRecorder {
    const supported = useSyncExternalStore(subscribeToNothing, readSupportedOnClient, readSupportedOnServer);
    const [recording, setRecording] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [sound, setSound] = useState<RecordedSound | null>(null);
    const [tooLong, setTooLong] = useState(false);

    const recorderRef = useRef<MediaRecorder | null>(null);
    // Bumped by every start and clear, by the length cap and by leaving the
    // page, so a recording that finishes after it was replaced or thrown
    // away keeps nothing. Each recording compares against its own number.
    const runRef = useRef(0);
    // Whether the current recording is still wanted. getUserMedia takes a
    // moment, and a stop can arrive before the microphone does.
    const wantedRef = useRef(false);

    const stop = useCallback(() => {
        wantedRef.current = false;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            recorder.stop(); // its onstop turns what it heard into the sound
        } else {
            setRecording(false);
        }
    }, []);

    const start = useCallback(() => {
        if (!readSupportedOnClient()) return;
        const previous = recorderRef.current;
        const run = ++runRef.current;
        // A recording still running is replaced: its onstop sees a newer
        // number and keeps nothing.
        if (previous && previous.state !== "inactive") previous.stop();
        wantedRef.current = true;
        setSound(null);
        setTooLong(false);
        setPreparing(false);
        setRecording(true);

        navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
                if (runRef.current !== run || !wantedRef.current) {
                    release(stream);
                    if (runRef.current === run) setRecording(false);
                    return;
                }
                const chunks: Blob[] = [];
                const recorder = new MediaRecorder(stream);
                recorderRef.current = recorder;
                // Past the cap the recording stops by itself and is marked
                // too long, rather than growing past what can be sent.
                const capTimer = setTimeout(() => {
                    if (runRef.current !== run) return;
                    runRef.current += 1;
                    setTooLong(true);
                    setRecording(false);
                    if (recorder.state !== "inactive") recorder.stop();
                }, (SHADOWING_SOUNDS_MAX_SECONDS + 1) * 1000);

                recorder.ondataavailable = (event) => {
                    if (event.data.size > 0) chunks.push(event.data);
                };
                recorder.onstop = () => {
                    clearTimeout(capTimer);
                    // Only ever its own microphone stream — never one a
                    // newer recording has opened since.
                    release(stream);
                    if (recorderRef.current === recorder) recorderRef.current = null;
                    if (runRef.current !== run) return;
                    setRecording(false);
                    if (chunks.length === 0) return;
                    setPreparing(true);
                    toWav(new Blob(chunks, { type: recorder.mimeType }))
                        .then((result) => {
                            if (runRef.current !== run) return;
                            if (result.seconds > SHADOWING_SOUNDS_MAX_SECONDS + 0.5) {
                                setTooLong(true);
                            } else {
                                setSound(result);
                            }
                        })
                        .catch(() => {
                            // Decoding failed: there is no sound to check,
                            // and nothing else on the page depends on one.
                        })
                        .finally(() => {
                            if (runRef.current === run) setPreparing(false);
                        });
                };
                recorder.start();
            })
            .catch(() => {
                // Permission refused or no microphone: no sound, nothing else
                // affected — the speech recognition reports its own errors.
                if (runRef.current === run) setRecording(false);
            });
    }, []);

    const clear = useCallback(() => {
        runRef.current += 1;
        wantedRef.current = false;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") recorder.stop();
        setRecording(false);
        setPreparing(false);
        setSound(null);
        setTooLong(false);
    }, []);

    // Leaving the page mid-recording lets go of the microphone and throws the
    // recording away.
    useEffect(() => {
        return () => {
            runRef.current += 1;
            wantedRef.current = false;
            const recorder = recorderRef.current;
            if (recorder && recorder.state !== "inactive") recorder.stop();
        };
    }, []);

    return { supported, recording, preparing, sound, tooLong, start, stop, clear };
}
