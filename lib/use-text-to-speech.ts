"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { splitIntoSentences } from "@/lib/sentence-split";
import { speakableText } from "./speech-text";

// Reading text aloud, as a hook (Question 290) — the mirror of
// lib/use-speech-to-text.ts, and the half a voice chat needs to answer out
// loud rather than only in writing.
//
// Uses the browser's own speechSynthesis, which this app already speaks
// through in four places, so this needs no key, no quota and no server call
// (Answer 288). Deliberately *not* a shared replacement for those four:
// Shadowing chains repeats and has a live rate control, the two Listen
// pages carry their own stale-run guards and skip rules, and Vocabulary
// Shuffle speaks a single word. Serving all of that would make this
// general enough to be useless and would put four working pages at risk.
// This serves one need — say this, in this language, and tell me when
// you're done — and borrows their hard-won patterns rather than their code.

const subscribeToNothing = () => () => {};
const readSupportedOnClient = () =>
    typeof window !== "undefined" && "speechSynthesis" in window;
const readSupportedOnServer = () => false;

export interface UseTextToSpeechOptions {
    // BCP-47 tag, e.g. "de-DE". The browser picks a matching voice if it
    // has one installed and falls back to its default if not — which is why
    // this only ever improves the common case rather than gating playback.
    lang?: string;
    // 1 is normal. A language learner listening to a language they don't
    // know well is exactly who wants this below 1, so it's here from the
    // start rather than retrofitted.
    rate?: number;
    // Fires when a run finishes *on its own*. Deliberately not called when
    // stop() interrupts one: the caller's reason for wanting this signal is
    // to know when it's safe to listen again, and a deliberate stop is the
    // caller's own action, not something it needs telling about.
    onFinished?: () => void;
}

export interface UseTextToSpeech {
    // False while rendering on the server, and its real value from the
    // first client render onward.
    supported: boolean;
    speaking: boolean;
    speak: (text: string) => void;
    stop: () => void;
}

export function useTextToSpeech({
    lang,
    rate = 1,
    onFinished,
}: UseTextToSpeechOptions = {}): UseTextToSpeech {
    // Read as an external value rather than held as state: a fact about the
    // browser that React doesn't own, with its own server answer so the
    // markup agrees on both sides and nothing hydration-mismatches.
    const supported = useSyncExternalStore(
        subscribeToNothing,
        readSupportedOnClient,
        readSupportedOnServer,
    );
    const [speaking, setSpeaking] = useState(false);

    // Bumped on every stop and every new run, so a callback still in flight
    // from a superseded utterance recognizes it's stale and does nothing —
    // the same guard Parallel Listen and Shadowing Practice both use, for
    // the same reason.
    const runIdRef = useRef(0);
    // Read inside callbacks bound when a run started, so they see current
    // values rather than whatever was set at the time.
    const langRef = useRef(lang);
    const rateRef = useRef(rate);
    const onFinishedRef = useRef(onFinished);
    // Chaining needs to call itself; a ref is how that's done without the
    // callback depending on its own identity.
    const speakFromRef = useRef<(sentences: string[], index: number, runId: number) => void>(
        () => {},
    );

    useEffect(() => {
        langRef.current = lang;
    }, [lang]);

    useEffect(() => {
        rateRef.current = rate;
    }, [rate]);

    useEffect(() => {
        onFinishedRef.current = onFinished;
    }, [onFinished]);

    const speakFrom = useCallback(
        (sentences: string[], index: number, runId: number) => {
            if (runIdRef.current !== runId) return; // stopped or superseded
            if (index >= sentences.length) {
                setSpeaking(false);
                onFinishedRef.current?.();
                return;
            }

            const utterance = new SpeechSynthesisUtterance(speakableText(sentences[index]));
            if (langRef.current) utterance.lang = langRef.current;
            utterance.rate = rateRef.current;
            utterance.onend = () => {
                if (runIdRef.current !== runId) return;
                speakFromRef.current(sentences, index + 1, runId);
            };
            // Skip what the browser can't voice and keep going, rather than
            // letting one bad sentence end the whole reply — Parallel
            // Listen's rule, and right for the same reason here.
            utterance.onerror = () => {
                if (runIdRef.current !== runId) return;
                speakFromRef.current(sentences, index + 1, runId);
            };
            window.speechSynthesis.speak(utterance);
        },
        [],
    );

    useEffect(() => {
        speakFromRef.current = speakFrom;
    }, [speakFrom]);

    const stop = useCallback(() => {
        runIdRef.current += 1;
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            // cancel() leaves the queue in a paused state in some browsers,
            // and a later speak() then produces silence. Parallel Listen
            // found this the hard way; resuming immediately after cancelling
            // is the fix.
            window.speechSynthesis.resume();
        }
        setSpeaking(false);
    }, []);

    const speak = useCallback(
        (text: string) => {
            if (typeof window === "undefined" || !("speechSynthesis" in window)) {
                return;
            }
            // Spoken sentence by sentence rather than as one utterance, for
            // both reasons the Listen pages already split: browsers truncate
            // long utterances, and a chain can be stopped between sentences
            // instead of only at the end.
            //
            // No special case for a reply too short to have punctuation —
            // splitIntoSentences returns the whole thing as one sentence
            // ("Hallo" comes back as ["Hallo"]), and gives back nothing only
            // for text that was empty to begin with. Checked, not assumed.
            const sentences = splitIntoSentences(text);
            if (sentences.length === 0) return;

            // Whatever was being said is superseded, not queued behind.
            window.speechSynthesis.cancel();
            window.speechSynthesis.resume();
            const runId = ++runIdRef.current;
            setSpeaking(true);
            speakFromRef.current(sentences, 0, runId);
        },
        [],
    );

    // Leaving the page mid-sentence must stop the voice, the same way
    // Shadowing Practice and the Listen pages cancel on the way out —
    // speechSynthesis outlives the component otherwise.
    useEffect(() => {
        return () => {
            runIdRef.current += 1;
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    return { supported, speaking, speak, stop };
}
