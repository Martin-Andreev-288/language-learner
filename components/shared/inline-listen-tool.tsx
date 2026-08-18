"use client";

import { useEffect, useRef, useState } from "react";
import { readAndClearInlineListenCarry } from "@/lib/inline-listen-carry";
import { buildParagraphs } from "@/lib/paragraph-sentences";
import { parseAnnotated, stripAnnotations } from "@/lib/inline-annotations";
import { guessLanguageCode } from "@/lib/language-codes";
import { formatInlineListenNote } from "@/lib/inline-listen-note-format";
import { createNote } from "@/app/actions/note-actions";
import { NotePage } from "@/app/generated/prisma";

export default function InlineListenTool() {
  // Restored from a carry, if the user arrived via "Send to Inline Listen"
  // — read as part of the initial state itself (Answer 171's discipline),
  // not in an effect afterward. Also works with nothing carried at all:
  // this page pastes and edits a passage directly too now, the same as
  // every other Listen-family tool, not carry-only the way it was in
  // iteration 1. Read exactly once, into its own piece of state, since the
  // carry read clears itself as a side effect — calling it separately to
  // seed both text and language would silently lose the second one.
  const [initialCarry] = useState(() => readAndClearInlineListenCarry());
  const [text, setText] = useState(() => initialCarry?.text ?? "");
  const [language, setLanguage] = useState(
    () => initialCarry?.sourceLanguage ?? "",
  );

  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const noteResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Same refs, same reasons, as Parallel Listen and Shadowing Practice:
  // playbackIdRef invalidates stale callbacks from a superseded run,
  // languageRef/rateRef let a live change read the *current* value instead
  // of whatever it was when a chained utterance's callback was created.
  const playbackIdRef = useRef(0);
  const languageRef = useRef("");
  const rateRef = useRef(1);
  // Points at whichever sentence's element is currently highlighted —
  // whichever one that is attaches this ref via a callback (see the
  // render below), so this always tracks the right node without needing
  // one ref per sentence.
  const activeSentenceRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Keeps the sentence being read centered in the viewport, the way
  // Balabolka does (Question 232) — runs whenever playback moves to a new
  // sentence. React commits the ref callback below before this effect
  // runs, so activeSentenceRef already points at the newly-active element
  // by the time this fires, not the previous one.
  useEffect(() => {
    if (currentIndex === null) return;
    activeSentenceRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [currentIndex]);

  // Recomputed on every render, straight from the editable text — this
  // page no longer freezes a sentence list at mount the way iteration 1
  // did, since the passage itself can change now. Grouped by the line
  // breaks the user actually pasted, the same as Parallel Listen's
  // Language-by-language mode (Answer 185), instead of flattening into
  // one sentence per row. The flat list used for playback is derived
  // from this exact same structure, so display and queue can never drift
  // apart.
  const paragraphs = buildParagraphs(text);
  const sentences = paragraphs.flat();
  const hasAnnotations = sentences.some((sentence) =>
    parseAnnotated(sentence.text).some((segment) => segment.marked),
  );

  function handleClear() {
    handleStop();
    setText("");
  }

  // Saves the raw passage and its language — not the current speed or
  // playback position — so "Listen again" later can reconstruct exactly
  // this session, the same scope Parallel Listen's own save already uses
  // (see lib/inline-listen-note-format.ts).
  async function handleSaveToNote() {
    if (!text.trim()) return;

    setSavingNote(true);
    try {
      const title = language.trim() || "Inline Listen";
      await createNote(
        NotePage.listening,
        title,
        formatInlineListenNote({ text, sourceLanguage: language }),
      );
      setNoteSaved(true);
      if (noteResetRef.current) clearTimeout(noteResetRef.current);
      noteResetRef.current = setTimeout(() => setNoteSaved(false), 2000);
    } catch {
      setPlaybackError("Couldn't save to Notes — try again.");
    } finally {
      setSavingNote(false);
    }
  }

  function handleStop() {
    playbackIdRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
    setPaused(false);
    setCurrentIndex(null);
  }

  // True pause/resume, not a restart — same caveat as Parallel Listen's
  // (Answer 178): reliability is genuinely browser-dependent, Chrome in
  // particular has a long-standing bug where resume() can silently fail to
  // continue after a pause. Worst case, Stop and Play again always works.
  function handlePause() {
    if (!playing || paused) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.pause();
    setPaused(true);
  }

  function handleResume() {
    if (!playing || !paused) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.resume();
    setPaused(false);
  }

  function speakFrom(index: number, playId: number) {
    if (playbackIdRef.current !== playId) return; // stopped or superseded
    if (index >= sentences.length) {
      setPlaying(false);
      setPaused(false);
      setCurrentIndex(null);
      return;
    }
    setCurrentIndex(index);
    // The sentence is spoken with its translations stripped out — the whole
    // point of sending a passage here from Inline Translate is to hear the
    // original, not to have a translation read into the middle of it
    // (Question 227). A sentence that was nothing *but* an annotation
    // leaves nothing to say, so step past it rather than handing the
    // speech engine an empty utterance that may never fire `onend`.
    const spoken = stripAnnotations(sentences[index].text).trim();
    if (!spoken) {
      speakFrom(index + 1, playId);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(spoken);
    const lang = guessLanguageCode(languageRef.current);
    if (lang) utterance.lang = lang;
    utterance.rate = rateRef.current;
    utterance.onend = () => speakFrom(index + 1, playId);
    utterance.onerror = () => speakFrom(index + 1, playId);
    window.speechSynthesis.speak(utterance);
  }

  function handlePlay() {
    if (sentences.length === 0) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlaybackError("Playback isn't supported in this browser.");
      return;
    }
    setPlaybackError(null);
    languageRef.current = language;
    window.speechSynthesis.cancel();
    const playId = ++playbackIdRef.current;
    setPlaying(true);
    setPaused(false);
    speakFrom(0, playId);
  }

  // Same "can't retune what's already in flight, so interrupt and restart
  // the current sentence instead" approach as Parallel Listen's live speed
  // change (Answer 175) and Shadowing Practice's live language change.
  function handleRateChange(nextRate: number) {
    setRate(nextRate);
    rateRef.current = nextRate;
    if (!playing) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const playId = ++playbackIdRef.current;
    setPaused(false);
    speakFrom(currentIndex ?? 0, playId);
  }

  function handleLanguageChange(next: string) {
    setLanguage(next);
    languageRef.current = next;
    if (!playing) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const playId = ++playbackIdRef.current;
    setPaused(false);
    speakFrom(currentIndex ?? 0, playId);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Inline Listen
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste a passage — or send one here from Inline Translate — and
            listen to it sentence by sentence.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Passage</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveToNote}
                disabled={savingNote || !text.trim()}
                title="Saves exactly this passage and its language, so you can listen again later — not the current speed or playback position"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  noteSaved
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                } disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500`}
              >
                {noteSaved
                  ? "Saved!"
                  : savingNote
                    ? "Saving…"
                    : "Save to a new note"}
              </button>
              <button
                onClick={handleClear}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Clear
              </button>
            </div>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste the passage you want to listen to…"
            className="h-40 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />

          {hasAnnotations && (
            <p className="mt-2 text-xs text-zinc-500">
              Translations sent from Inline Translate are written as{" "}
              <code className="text-zinc-400">**word** (*translation*)</code> —
              shown below, never read aloud.
            </p>
          )}

          <label className="mt-4 block text-sm font-semibold text-zinc-300">
            Language{" "}
            <span className="font-normal text-zinc-500">
              (picks a matching voice)
            </span>
            <input
              type="text"
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value)}
              placeholder="e.g. Italian"
              className="mt-2 w-full max-w-xs rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />
          </label>
        </div>

        {text.trim() && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Preview</h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                  Speed
                  <select
                    value={rate}
                    onChange={(event) =>
                      handleRateChange(Number(event.target.value))
                    }
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
                {!playing ? (
                  <button
                    onClick={handlePlay}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    ▶ Play
                  </button>
                ) : paused ? (
                  <button
                    onClick={handleResume}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    ▶ Resume
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    ⏸ Pause
                  </button>
                )}
                <button
                  onClick={handleStop}
                  disabled={!playing}
                  className="rounded-md bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ■ Stop
                </button>
              </div>
            </div>

            {playbackError && (
              <p className="mb-4 text-sm text-red-400">{playbackError}</p>
            )}

            {playing && currentIndex !== null && (
              <p className="mb-4 text-sm text-indigo-400">
                {paused ? "Paused at" : "Reading"} sentence{" "}
                {currentIndex + 1} of {sentences.length}
              </p>
            )}

            <div className="space-y-4">
              {paragraphs.map((paragraphSentences, paraIndex) => (
                <p
                  key={paraIndex}
                  className="text-lg leading-relaxed text-zinc-100"
                >
                  {paragraphSentences.map((sentence, i) => {
                    const isSpeaking = currentIndex === sentence.index;
                    return (
                    <span key={sentence.index}>
                      {i > 0 && " "}
                      <span
                        ref={(el) => {
                          if (isSpeaking) activeSentenceRef.current = el;
                        }}
                        className={`rounded px-1 py-0.5 ${
                          isSpeaking
                            ? "bg-indigo-900/50 ring-1 ring-inset ring-indigo-500"
                            : ""
                        }`}
                      >
                        {/* Same bold-word, dimmed-translation treatment
                            Inline Translate's own Result panel uses, so a
                            carried passage looks here the way it looked
                            there — the raw `**word** (*translation*)` text
                            stays in the editable field above, not in the
                            reading view. */}
                        {parseAnnotated(sentence.text).map(
                          (segment, segmentIndex) =>
                            segment.marked ? (
                              <span key={segmentIndex}>
                                <strong className="text-indigo-200">
                                  {segment.text}
                                </strong>
                                {segment.translation && (
                                  <em className="text-zinc-500">
                                    {" "}
                                    ({segment.translation})
                                  </em>
                                )}
                              </span>
                            ) : (
                              <span key={segmentIndex}>{segment.text}</span>
                            ),
                        )}
                      </span>
                    </span>
                    );
                  })}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
