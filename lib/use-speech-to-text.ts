"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

// Dictation via the browser's own speech recognition (Question 280).
//
// Deliberately the browser's API rather than an AI transcription call: it is
// free, needs no key or quota, returns words *as they are spoken* rather
// than after an upload-and-wait, and it is the sibling of the
// `speechSynthesis` this app already uses in Shadowing Practice and the
// Listen pages — so it belongs to a family of thing already here rather than
// being a new kind of integration (Answer 278).
//
// This hook deliberately does not own the text. It reports finalized chunks
// through a callback and exposes whatever is still being spoken separately,
// so the page using it keeps a single editable value the user can type into
// and correct — which is the whole point, since no speech recognition can
// hear the difference between homophones like "pain" and "pains".

// --- Minimal Web Speech API typings --------------------------------------
// TypeScript 5.9's DOM lib ships SpeechRecognitionResultList, ...Result and
// ...Alternative, but *not* the SpeechRecognition interface itself, nor its
// two event types. Declared here rather than pulled in as a dependency, and
// kept to exactly the members this hook touches rather than transcribing the
// whole spec.

interface SpeechRecognitionResultEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionFailureEvent extends Event {
    readonly error: string;
    readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
    onerror: ((event: SpeechRecognitionFailureEvent) => void) | null;
    onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

// Chromium and Safari both still expose this prefixed; the unprefixed name
// is checked first so nothing has to change if that stops being true.
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
    if (typeof window === "undefined") return null;
    const candidate = window as unknown as {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return (
        candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
    );
}

// What is new in a piece of dictation, given what this session has already
// written: the piece, minus any words at its start that repeat the end of
// what came before (Question 58).
//
// Needed on Android only. There the browser hands the speech to the
// phone's own recognition service, which, in continuous dictation, sends
// each new piece with the earlier words of the same sentence again —
// "il", "il y", "il y a", "il y a le problème" — where Chrome on a
// computer sends "il", " y", " a", " le problème". Added to the text box
// one after another, those became "il il y il y a il y a le problème".
//
// Compared word by word, ignoring case and punctuation, so "problème" and
// "Problème." count as the same word. The one thing it can't tell apart is
// a word you really did say twice across two pieces — "il y a, il y a" —
// which is why it is used on Android only, where the repeats are the rule.
export function wordsNotYetWritten(writtenSoFar: string, piece: string): string {
    const wordsOf = (value: string) => value.trim().split(/\s+/).filter(Boolean);
    const key = (word: string) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const before = wordsOf(writtenSoFar);
    const next = wordsOf(piece);
    for (let overlap = Math.min(before.length, next.length); overlap > 0; overlap--) {
        const tail = before.slice(before.length - overlap);
        if (tail.every((word, i) => key(word) === key(next[i]))) {
            return next.slice(overlap).join(" ");
        }
    }
    return next.join(" ");
}

const repeatsEarlierWords = () =>
    typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

// How long a stretch of pure silence ends a dictation deliberately.
//
// This exists because of what happens without it. A long dictation is really
// a chain of sessions — the browser ends one after a few seconds of silence
// and this hook starts the next — and every restart opens a fresh connection
// to the browser's speech service. Left to run through a genuinely long
// pause, that becomes dozens of reconnections in a row, and the service
// eventually refuses one, surfacing as a "network" failure that has nothing
// to do with the user's network (Question 283). Stopping on purpose first
// turns a confusing error into an expected, explainable end.
const IDLE_STOP_AFTER_MS = 45_000;

// Whether a stop is worth alarming the user about. A `notice` is an ordinary
// end to a dictation — nothing broke, press the button again. An `error` is
// something that needs attention before dictation can work at all.
interface RecognitionStopReason {
    kind: "error" | "notice";
    message: string;
}

// "no-speech" and "aborted" are absent on purpose — both are handled before
// this is ever reached, since neither is something to tell the user about.
function describeRecognitionError(code: string, startLabel: string): RecognitionStopReason {
    switch (code) {
        case "not-allowed":
        case "service-not-allowed":
            return {
                kind: "error",
                message:
                    "Microphone access is blocked. Allow it for this site in your browser, then try again.",
            };
        case "audio-capture":
            return { kind: "error", message: "No microphone was found." };
        case "network":
            // Two very different situations arrive under one code, and
            // navigator.onLine separates the one the user can act on from the
            // one they can't. Being offline is worth saying plainly; the
            // service simply dropping a reconnection is not the user's
            // problem and shouldn't be dressed up as a network fault.
            return typeof navigator !== "undefined" && !navigator.onLine
                ? {
                      kind: "error",
                      message:
                          "You're offline — dictation needs a connection, because the browser does the recognition on a server.",
                  }
                : {
                      kind: "notice",
                      message:
                          `Dictation stopped — the speech service ended the session. Press ${startLabel} to carry on.`,
                  };
        case "language-not-supported":
            return {
                kind: "error",
                message:
                    "Your browser's speech recognition doesn't support that language.",
            };
        default:
            return {
                kind: "error",
                message: "Dictation stopped unexpectedly — try again.",
            };
    }
}

// Whether this browser can do it at all, read through useSyncExternalStore
// rather than as state — see the call site for why.
const subscribeToNothing = () => () => {};
const readSupportedOnClient = () => getSpeechRecognition() !== null;
const readSupportedOnServer = () => false;

export interface UseSpeechToTextOptions {
    // BCP-47 tag, e.g. "fr-FR" — lib/language-codes.ts's guessLanguageCode
    // already returns exactly this shape, which is what Shadowing feeds to
    // the speaking half of the same API. Undefined lets the browser use its
    // own default rather than guessing on the user's behalf.
    lang?: string;
    // Called with each finalized chunk of speech. The caller appends it to
    // whatever it is building; this hook never accumulates a transcript of
    // its own, so there is exactly one copy of the text and it lives with
    // the field the user can edit.
    onFinalResult: (text: string) => void;
    // What the page's start button is called, for the messages that say how
    // to carry on. "Dictate" is Writing Check's and Voice Chat's; Shadowing's
    // says Record, and a message naming a button that isn't on the page
    // reads as a broken one (Question 38).
    startLabel?: string;
}

export interface UseSpeechToText {
    // False while rendering on the server, and its real value from the first
    // client render onward.
    supported: boolean;
    listening: boolean;
    // What is currently being said and hasn't settled yet. Shown as a live
    // preview; it is replaced, not appended to, until it finalizes.
    interimTranscript: string;
    // Something that needs attention before dictation can work: a blocked
    // microphone, no microphone, being offline.
    error: string | null;
    // An ordinary end to a dictation, worth explaining but not worth
    // alarming anyone about — a long silence, or the speech service closing
    // the session. Press the button again and carry on.
    notice: string | null;
    start: () => void;
    stop: () => void;
}

export function useSpeechToText({
    lang,
    onFinalResult,
    startLabel = "Dictate",
}: UseSpeechToTextOptions): UseSpeechToText {
    // Read as an external value rather than held as state, which is exactly
    // what this is: a fact about the browser that React doesn't own and that
    // never changes while the page is open. The third argument is the reason
    // this isn't just `getSpeechRecognition() !== null` inline — it gives
    // the server (where `window` doesn't exist) its own answer, so the
    // markup React renders on both sides agrees and there's no hydration
    // mismatch. `subscribeToNothing` never fires because there's nothing to
    // subscribe to; the value is settled from the first client render on.
    const supported = useSyncExternalStore(
        subscribeToNothing,
        readSupportedOnClient,
        readSupportedOnServer,
    );
    const [listening, setListening] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    // Runs across the whole chain of sessions, not per session: it measures
    // how long it has been since anything was actually *said*, which is the
    // thing worth ending a dictation over.
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Whether the *user* still wants to be listening, as opposed to whether
    // a recognition session happens to be running. The two differ
    // constantly: Chrome ends a session on its own after a pause even with
    // `continuous` set, so a long dictation is really many sessions, and
    // this is what tells `onend` to start another one rather than stop.
    const wantListeningRef = useRef(false);
    // Read inside handlers that were bound once, so they see the current
    // value rather than whatever it was when listening began — the same
    // reason Shadowing Practice keeps its language in a ref.
    const langRef = useRef(lang);
    const startLabelRef = useRef(startLabel);
    const onFinalResultRef = useRef(onFinalResult);

    useEffect(() => {
        langRef.current = lang;
        startLabelRef.current = startLabel;
    }, [lang, startLabel]);

    useEffect(() => {
        onFinalResultRef.current = onFinalResult;
    }, [onFinalResult]);

    const clearIdleTimer = useCallback(() => {
        if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
            idleTimerRef.current = null;
        }
    }, []);

    // The single way a dictation ends, whoever ends it. `reason` is null when
    // the user pressed Stop — nothing to explain about that.
    const finishListening = useCallback(
        (reason: RecognitionStopReason | null) => {
            wantListeningRef.current = false;
            clearIdleTimer();
            recognitionRef.current?.stop();
            setListening(false);
            setInterimTranscript("");
            if (reason?.kind === "error") {
                setError(reason.message);
            } else if (reason?.kind === "notice") {
                setNotice(reason.message);
            }
        },
        [clearIdleTimer],
    );

    const armIdleTimer = useCallback(() => {
        clearIdleTimer();
        idleTimerRef.current = setTimeout(() => {
            // A dictation already ended has no pause to report.
            if (!wantListeningRef.current) return;
            finishListening({
                kind: "notice",
                message:
                    `Dictation stopped after a long pause — press ${startLabelRef.current} to carry on.`,
            });
        }, IDLE_STOP_AFTER_MS);
    }, [clearIdleTimer, finishListening]);

    const stop = useCallback(() => {
        finishListening(null);
    }, [finishListening]);

    // Every leg of a dictation gets its own recognition object, built and
    // configured as a local and only then handed to the ref. Two reasons,
    // one of them enforced: the React Compiler's immutability rule rejects
    // writing to properties of a value read back out of a ref, and building
    // fresh means the language is re-read on every leg rather than fixed at
    // whatever it was when the first one started.
    const beginSessionRef = useRef<() => void>(() => {});

    const beginSession = useCallback(() => {
        const SpeechRecognitionClass = getSpeechRecognition();
        if (!SpeechRecognitionClass) return;

        const recognition = new SpeechRecognitionClass();
        recognition.lang = langRef.current ?? "";
        recognition.continuous = true;
        recognition.interimResults = true;
        // One alternative is all this needs: the point is a first draft the
        // user then edits, not a ranked list to choose between.
        recognition.maxAlternatives = 1;

        // On Android, what this session has written so far, so a piece that
        // repeats it can be cut back to its new words (see
        // wordsNotYetWritten). Per session: a new one starts afresh.
        const cutRepeats = repeatsEarlierWords();
        let writtenThisSession = "";

        recognition.onresult = (event) => {
            let finalChunk = "";
            let interim = "";
            // From resultIndex, not 0 — earlier entries were already
            // reported, and re-reading them would duplicate the text.
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0]?.transcript ?? "";
                if (result.isFinal) {
                    if (cutRepeats) {
                        const fresh = wordsNotYetWritten(writtenThisSession, transcript);
                        if (fresh) {
                            finalChunk = finalChunk ? `${finalChunk} ${fresh}` : fresh;
                            writtenThisSession = `${writtenThisSession} ${fresh}`;
                        }
                    } else {
                        finalChunk += transcript;
                    }
                } else {
                    interim += transcript;
                }
            }
            // Anything heard at all — even a word still being revised —
            // means this isn't silence, so the idle countdown starts over.
            // Only while a dictation is wanted, though: the browser sends
            // the last words a moment *after* Stop, and re-arming then left
            // a countdown running past the end, which 45 seconds later
            // announced a "long pause" stop nobody had made (Question 37).
            if ((finalChunk || interim) && wantListeningRef.current) armIdleTimer();
            if (finalChunk) onFinalResultRef.current(finalChunk);
            setInterimTranscript(interim);
        };

        recognition.onerror = (event) => {
            // Normal punctuation of a long dictation, not a failure:
            // "no-speech" is a pause, and "aborted" is this hook's own stop()
            // or unmount. Both are left to onend to handle.
            if (event.error === "no-speech" || event.error === "aborted") {
                return;
            }
            // A failure of a session you had already ended is nothing to
            // report: you pressed Stop, and that is how it ended. Chrome's
            // speech service can still send one while it closes — "network"
            // most often — and it read as "Dictation stopped — the speech
            // service ended the session" under an attempt that had gone
            // perfectly well (Question 38).
            if (!wantListeningRef.current) return;
            finishListening(describeRecognitionError(event.error, startLabelRef.current));
        };

        recognition.onend = () => {
            if (!wantListeningRef.current) {
                setListening(false);
                setInterimTranscript("");
                return;
            }
            // Silence ended the session, not the user. Start another so a
            // pause mid-sentence doesn't quietly end the dictation.
            beginSessionRef.current();
        };

        recognitionRef.current = recognition;

        try {
            recognition.start();
            setListening(true);
        } catch {
            // The browser refused to start another session. Treat it as
            // stopped rather than retrying blindly into a loop.
            finishListening({
                kind: "notice",
                message:
                    `Dictation stopped — press ${startLabelRef.current} to start listening again.`,
            });
        }
    }, [armIdleTimer, finishListening]);

    useEffect(() => {
        beginSessionRef.current = beginSession;
    }, [beginSession]);

    const start = useCallback(() => {
        if (wantListeningRef.current) return;
        if (getSpeechRecognition() === null) return;
        // Both cleared: whatever ended the last dictation has been answered
        // by the user pressing the button again.
        setError(null);
        setNotice(null);
        wantListeningRef.current = true;
        armIdleTimer();
        beginSessionRef.current();
    }, [armIdleTimer]);

    // Leaving the page mid-dictation must release the microphone, the same
    // way Shadowing Practice cancels speech on the way out.
    useEffect(() => {
        return () => {
            wantListeningRef.current = false;
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            recognitionRef.current?.abort();
        };
    }, []);

    return {
        supported,
        listening,
        interimTranscript,
        error,
        notice,
        start,
        stop,
    };
}
