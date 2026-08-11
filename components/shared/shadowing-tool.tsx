"use client";

import { useEffect, useRef, useState } from "react";
import { splitIntoSentences } from "@/lib/sentence-split";
import { guessLanguageCode } from "@/lib/language-codes";

export default function ShadowingTool() {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(1);
  const [repeatCount, setRepeatCount] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  // Bumped on every stop/replay/navigate so an in-flight utterance callback
  // from a superseded run recognizes it's stale and does nothing when it
  // fires — same pattern Parallel Listen uses for the same reason.
  const playbackIdRef = useRef(0);
  // speakRemaining's callbacks are chained across multiple utterances, so
  // they need to read the *current* language, not whatever it was when the
  // repeat cycle started — same reasoning as Parallel Listen's rateRef.
  const languageRef = useRef("");
  // How many repeats are left in the cycle currently sounding, so a live
  // language change can restart from the same point instead of resetting
  // the repeat count.
  const remainingRef = useRef(0);

  const sentences = splitIntoSentences(text);
  const current = sentences[index];

  // Stop any speech in progress if the page is left mid-playback.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function handleStop() {
    playbackIdRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
  }

  // Speaks the current sentence, then chains into itself for however many
  // repeats are left — shadowing usually means hearing a sentence more than
  // once before attempting it, not just once through.
  function speakRemaining(remaining: number, playId: number) {
    if (playbackIdRef.current !== playId) return; // stopped or superseded
    if (remaining <= 0 || !current) {
      setPlaying(false);
      return;
    }
    remainingRef.current = remaining;
    const utterance = new SpeechSynthesisUtterance(current);
    const lang = guessLanguageCode(languageRef.current);
    if (lang) utterance.lang = lang;
    utterance.rate = rate;
    utterance.onend = () => speakRemaining(remaining - 1, playId);
    utterance.onerror = () => speakRemaining(remaining - 1, playId);
    window.speechSynthesis.speak(utterance);
  }

  function handlePlay() {
    if (!current) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlaybackError("Playback isn't supported in this browser.");
      return;
    }
    setPlaybackError(null);
    languageRef.current = language;
    window.speechSynthesis.cancel();
    const playId = ++playbackIdRef.current;
    setPlaying(true);
    speakRemaining(repeatCount, playId);
  }

  // Changing language mid-playback interrupts and re-speaks the sentence
  // currently sounding, at the new voice, picking up from the same point in
  // the repeat count — the same "can't retune what's already in flight, so
  // restart instead" approach Parallel Listen uses for a live speed change.
  function handleLanguageChange(next: string) {
    setLanguage(next);
    languageRef.current = next;
    if (!playing) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const playId = ++playbackIdRef.current;
    speakRemaining(remainingRef.current, playId);
  }

  function handleStart() {
    if (sentences.length === 0) return;
    setIndex(0);
    setStarted(true);
  }

  function handleEditPassage() {
    handleStop();
    setStarted(false);
  }

  function handlePrev() {
    handleStop();
    setIndex((i) => Math.max(i - 1, 0));
  }

  function handleNext() {
    handleStop();
    setIndex((i) => Math.min(i + 1, sentences.length - 1));
  }

  function handleClear() {
    handleStop();
    setText("");
    setStarted(false);
    setIndex(0);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Shadowing Practice
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste a passage, then go through it one sentence at a time —
            practice repeating each one out loud at your own pace.
          </p>
        </div>

        {!started ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Passage</h2>
              <button
                onClick={handleClear}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Clear
              </button>
            </div>

            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste the passage you want to practice…"
              className="h-64 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />

            <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Language{" "}
              <span className="normal-case font-normal text-zinc-600">
                (optional — picks a matching voice for playback)
              </span>
            </label>
            <input
              type="text"
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value)}
              placeholder="e.g. German"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />

            {text.trim() && (
              <p className="mt-2 text-xs text-zinc-500">
                {sentences.length} sentence
                {sentences.length !== 1 ? "s" : ""} found.
              </p>
            )}

            <button
              onClick={handleStart}
              disabled={sentences.length === 0}
              className="mt-4 w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              Start practicing
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <span className="text-sm text-zinc-500">
                Sentence {index + 1} of {sentences.length}
              </span>
              <button
                onClick={handleEditPassage}
                className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200"
              >
                ← Back to passage
              </button>
            </div>

            <div className="flex min-h-40 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 p-8 text-center">
              <p className="text-xl leading-relaxed text-zinc-100">
                {current}
              </p>
            </div>

            {playbackError && (
              <p className="mt-3 text-sm text-red-400">{playbackError}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <label
                title="Changing this mid-playback restarts the current repeat at the new voice, same as changing speed does"
                className="flex items-center gap-1.5 text-sm text-zinc-400"
              >
                Language
                <input
                  type="text"
                  value={language}
                  onChange={(event) =>
                    handleLanguageChange(event.target.value)
                  }
                  placeholder="e.g. German"
                  className="w-28 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                Speed
                <select
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                >
                  <option value={0.5}>0.5×</option>
                  <option value={0.75}>0.75×</option>
                  <option value={1}>1×</option>
                  <option value={1.25}>1.25×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2}>2×</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                Repeat
                <select
                  value={repeatCount}
                  onChange={(event) =>
                    setRepeatCount(Number(event.target.value))
                  }
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                >
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={3}>3×</option>
                </select>
              </label>
              {!playing ? (
                <button
                  onClick={handlePlay}
                  className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  ▶ Play
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="rounded-md bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                >
                  ■ Stop
                </button>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={handlePrev}
                disabled={index === 0}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                onClick={handleNext}
                disabled={index === sentences.length - 1}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
