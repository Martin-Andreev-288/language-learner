"use client";

import { useEffect, useRef, useState } from "react";
import { splitIntoSentences } from "@/lib/sentence-split";
import { readAndClearCarriedColumns } from "@/lib/parallel-listen-carry";
import {
  encodeParallelListenMetadata,
  formatParallelListenTranscript,
  PARALLEL_LISTEN_METADATA_KIND,
} from "@/lib/parallel-listen-note-format";
import { guessLanguageCode } from "@/lib/language-codes";
import LanguageCombobox from "@/components/shared/language-combobox";
import { buildParagraphs } from "@/lib/paragraph-sentences";
import { speakableText } from "@/lib/speech-text";
import { createNote } from "@/app/actions/note-actions";
import { NotePage } from "@/app/generated/prisma";

interface LanguageColumn {
  id: number;
  name: string;
  text: string;
  included: boolean;
}

interface AlignedRows {
  rows: string[][];
}

// `index` means different things depending on reading order: in
// "sentence" mode it's the shared row index into the aligned preview grid;
// in "language" mode there's no shared grid, so it's the position within
// that column's own independent sentence list. Both playback and rendering
// treat it as "which sentence within this column" either way.
interface PlaybackPosition {
  index: number;
  col: number;
}

type ViewMode = "table" | "vertical";
// "sentence": today's default — sentence 1 in every checked language, then
// sentence 2 in every checked language, and so on (row-major).
// "language": read one whole checked language start to finish (every
// sentence of it, in order) before moving to the next checked language
// (column-major). Both walk the exact same sentence-level queue items —
// only the order they're pushed in changes.
type ReadingOrder = "sentence" | "language";

const SEEK_HINT = "Click to start reading from here";

// Same palette Parallel Translate uses to color-code language labels in its
// own vertical preview — duplicated rather than imported, since it's a
// small, purely presentational constant, not shared logic.
const PREVIEW_COLORS = [
  "text-blue-400",
  "text-emerald-400",
  "text-purple-400",
  "text-orange-400",
  "text-pink-400",
  "text-cyan-400",
  "text-lime-400",
  "text-amber-400",
];

function parseColumns(columns: LanguageColumn[]): AlignedRows | null {
  const texts = columns.map((c) => c.text);
  if (texts.length === 0 || texts.every((t) => !t.trim())) return null;

  const sentencesPerLanguage = texts.map((text) => splitIntoSentences(text));
  const maxSentences = Math.max(...sentencesPerLanguage.map((s) => s.length));

  const rows: string[][] = [];
  for (let i = 0; i < maxSentences; i++) {
    const row = sentencesPerLanguage.map((sentences) => sentences[i] || "");
    if (row.some((text) => text)) {
      rows.push(row);
    }
  }

  return { rows };
}

let nextColumnId = 0;
function makeColumn(name = ""): LanguageColumn {
  nextColumnId += 1;
  return { id: nextColumnId, name, text: "", included: true };
}

export default function ParallelListenTool() {
  // One-time hand-off from Parallel Translate, if the user arrived here via
  // "Send to Parallel Listen." Read as part of the initial state itself,
  // not in an effect afterward, so there's no extra render and nothing to
  // persist — sessionStorage is checked and cleared exactly once, on mount.
  const [columns, setColumns] = useState<LanguageColumn[]>(() => {
    const carried = readAndClearCarriedColumns();
    if (carried && carried.length > 0) {
      return carried.map((column) => ({
        ...makeColumn(column.name),
        text: column.text,
      }));
    }
    return [makeColumn(), makeColumn()];
  });

  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [current, setCurrent] = useState<PlaybackPosition | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [readingOrder, setReadingOrder] = useState<ReadingOrder>("sentence");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const noteResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every stop/replay so any in-flight utterance callback from a
  // superseded run recognizes it's stale and does nothing when it fires.
  const playbackIdRef = useRef(0);
  // The built queue and "which item is currently speaking" live in refs, not
  // state, so a live speed change can jump back into the same queue at the
  // same spot without needing handlePlay to rebuild anything.
  const queueRef = useRef<
    { position: PlaybackPosition; text: string; lang?: string }[]
  >([]);
  const currentIndexRef = useRef(0);
  // Utterances read the rate from here, not from the `rate` state closure —
  // speakFrom's callbacks are created once per utterance and can otherwise
  // end up reading whatever `rate` was at the time speech for that sentence
  // started, not the latest value the user just picked mid-playback.
  const rateRef = useRef(1);
  // Points at whichever cell/paragraph/span is currently highlighted as
  // "being read" — whichever element that is, across all three layouts,
  // attaches this ref via a callback (see the render below), so this
  // always tracks the right node without needing one ref per sentence.
  const activeSentenceRef = useRef<HTMLElement | null>(null);

  // Playback is driven entirely by the browser's speechSynthesis queue, not
  // React state — this only cancels it if the page is left mid-playback.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Keeps the sentence being read centered in the viewport, the way
  // Balabolka does (Question 232) — runs whenever playback moves to a new
  // position. React commits the ref callback below before this effect
  // runs, so activeSentenceRef already points at the newly-active element
  // by the time this fires, not the previous one.
  useEffect(() => {
    if (!current) return;
    activeSentenceRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [current]);

  function handleStop() {
    playbackIdRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
    setPaused(false);
    setCurrent(null);
  }

  // True pause/resume, not a cancel-and-restart — this asks the browser to
  // hold the *current* utterance in place and continue it later, unlike
  // handleRateChange's restart. Whether that actually works reliably is
  // genuinely browser-dependent; see Answer 178 for the caveat.
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

  // Speaks queueRef.current[index] and chains to the next index on end,
  // as long as playId is still the active run (a new one is minted whenever
  // playback is stopped, replayed, or restarted after a live speed change).
  function speakFrom(index: number, playId: number) {
    const queue = queueRef.current;
    if (index >= queue.length) {
      setPlaying(false);
      setPaused(false);
      setCurrent(null);
      return;
    }
    currentIndexRef.current = index;
    const item = queue[index];
    setCurrent(item.position);
    const utterance = new SpeechSynthesisUtterance(speakableText(item.text));
    if (item.lang) utterance.lang = item.lang;
    utterance.rate = rateRef.current;
    utterance.onend = () => {
      if (playbackIdRef.current !== playId) return; // stopped or superseded
      speakFrom(index + 1, playId);
    };
    utterance.onerror = () => {
      if (playbackIdRef.current !== playId) return;
      speakFrom(index + 1, playId); // skip what the browser can't voice, keep going
    };
    window.speechSynthesis.speak(utterance);
  }

  // Builds the full playback queue for the current columns, checked
  // languages, and reading order. Extracted out of handlePlay (Question
  // 235) so clicking a sentence can build the exact same queue and start
  // partway into it, rather than having a second, subtly-different notion
  // of what the queue contains.
  function buildQueue(): {
    position: PlaybackPosition;
    text: string;
    lang?: string;
  }[] {
    if (!parsed) return [];

    const includedIndexes = columns
      .map((column, idx) => (column.included ? idx : -1))
      .filter((idx) => idx !== -1);

    const queue: {
      position: PlaybackPosition;
      text: string;
      lang?: string;
    }[] = [];

    if (readingOrder === "language") {
      // Independent per-language reading — deliberately not built from the
      // aligned `parsed.rows` grid. That grid pads every language to match
      // the longest one, which only matters for interleaving sentence by
      // sentence; here each language just reads its own sentences, in its
      // own count, with no relationship to any other column's count. Built
      // from the same paragraph grouping the preview renders, flattened, so
      // queued order and displayed order can never drift apart.
      includedIndexes.forEach((colIdx) => {
        const sentences = paragraphsByColumn[colIdx].flat();
        sentences.forEach(({ text, index }) => {
          if (text.trim()) {
            queue.push({
              position: { index, col: colIdx },
              text,
              lang: guessLanguageCode(columns[colIdx].name),
            });
          }
        });
      });
    } else {
      // Row-major (today's default): sentence 1 in every checked language,
      // then sentence 2 in every checked language, and so on — needs the
      // aligned grid, since it's interleaving across languages by position.
      parsed.rows.forEach((row, rowIdx) => {
        includedIndexes.forEach((colIdx) => {
          const text = row[colIdx];
          if (text.trim()) {
            queue.push({
              position: { index: rowIdx, col: colIdx },
              text,
              lang: guessLanguageCode(columns[colIdx].name),
            });
          }
        });
      });
    }

    return queue;
  }

  // The shared tail of every "start speaking" path — install the queue,
  // interrupt anything in flight, mint a new playback id so superseded
  // callbacks go quiet, and speak from the given position.
  function startPlayback(
    queue: { position: PlaybackPosition; text: string; lang?: string }[],
    startIndex: number,
  ) {
    setPlaybackError(null);
    queueRef.current = queue;
    window.speechSynthesis.cancel();
    // cancel() empties the queue but deliberately does *not* clear a paused
    // state, so starting from a pause would otherwise queue an utterance
    // that never speaks. resume() is a no-op when nothing is paused, so
    // this is safe unconditionally.
    window.speechSynthesis.resume();
    const playId = ++playbackIdRef.current;
    setPlaying(true);
    setPaused(false);
    speakFrom(startIndex, playId);
  }

  function handlePlay() {
    if (!parsed) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlaybackError("Playback isn't supported in this browser.");
      return;
    }

    if (!columns.some((column) => column.included)) {
      setPlaybackError("Check at least one language to play.");
      return;
    }

    const queue = buildQueue();
    if (queue.length === 0) {
      setPlaybackError("Nothing to play for the checked languages.");
      return;
    }

    startPlayback(queue, 0);
  }

  // Clicking any sentence in the preview jumps playback there — whether
  // something is already playing or not, so this doubles as "start here"
  // from a standing stop, not only as a mid-playback seek. A sentence in
  // an unchecked language isn't in the queue at all, so it's rendered
  // unclickable rather than silently doing nothing when clicked.
  function handleSeekTo(position: PlaybackPosition) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlaybackError("Playback isn't supported in this browser.");
      return;
    }

    const queue = buildQueue();
    const startIndex = queue.findIndex(
      (item) =>
        item.position.index === position.index &&
        item.position.col === position.col,
    );
    if (startIndex === -1) return;

    startPlayback(queue, startIndex);
  }

  // Web Speech doesn't let you retune an utterance already being spoken —
  // unlike a <video>/<audio> element's playbackRate, there's no live knob on
  // a SpeechSynthesisUtterance in flight. The closest honest equivalent:
  // interrupt immediately and re-speak the current sentence at the new
  // rate, then carry on from there — so the new speed takes effect right
  // away instead of waiting for the (possibly still-slow) current sentence
  // to finish first.
  // Note this also applies while paused: a paused utterance already has its
  // old rate baked in (same limitation pause/resume can't get around
  // either), so a rate change while paused restarts the current sentence
  // too — which means it also resumes playback, not just changes speed.
  function handleRateChange(nextRate: number) {
    setRate(nextRate);
    rateRef.current = nextRate;
    if (!playing) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume(); // see startPlayback — cancel() leaves a pause in place
    const playId = ++playbackIdRef.current;
    setPaused(false);
    speakFrom(currentIndexRef.current, playId);
  }

  function updateColumn(id: number, patch: Partial<LanguageColumn>) {
    setColumns((prev) =>
      prev.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    );
  }

  function handleAddLanguage() {
    setColumns((prev) => [...prev, makeColumn()]);
  }

  function handleRemoveLanguage(id: number) {
    if (columns.length <= 1) return;
    setColumns((prev) => prev.filter((column) => column.id !== id));
  }

  function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    setColumns((prev) => {
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function handleClear() {
    handleStop();
    setColumns([makeColumn(), makeColumn()]);
  }

  // Saves the raw pasted columns themselves — not a transcript of what was
  // read, not the current speed/order/view — so "Listen again" later can
  // reconstruct exactly this session, as if freshly pasted. See
  // lib/parallel-listen-note-format.ts for the save/parse format.
  async function handleSaveToNote() {
    const hasContent = columns.some((column) => column.text.trim());
    if (!hasContent) return;

    setSavingNote(true);
    try {
      const title =
        columns
          .map((column) => column.name.trim())
          .filter(Boolean)
          .join(" / ") || "Parallel Listen";
      await createNote(
        NotePage.listening,
        title,
        // Content is only the readable transcript now; what "Listen again"
        // needs rides in metadata instead of being hidden inside it.
        formatParallelListenTranscript(columns),
        null,
        {
          kind: PARALLEL_LISTEN_METADATA_KIND,
          data: encodeParallelListenMetadata(columns),
        },
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

  const parsed = parseColumns(columns);
  const includedCount = columns.filter((column) => column.included).length;
  // Each column's own sentences, grouped by the paragraph (line) the user
  // actually pasted them in — independent of every other column's count.
  // What the "language" reading order and its grouped preview use instead
  // of the aligned, padded-to-match grid `parsed` builds.
  const paragraphsByColumn = columns.map((column) =>
    buildParagraphs(column.text),
  );
  // Table view only makes sense for the aligned grid Sentence-by-sentence
  // mode uses — there's nothing to tabulate once languages aren't aligned
  // to a shared row count, so Language-by-language always renders Vertical,
  // grouped by language, regardless of whatever `viewMode` was last set to.
  const effectiveViewMode: ViewMode =
    readingOrder === "language" ? "vertical" : viewMode;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Parallel Listen
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste the same passage in two or more languages, choose which
            ones to hear, and listen to them in the order the languages are
            arranged below — either sentence by sentence across all of them,
            or one whole language at a time — skipping the ones you leave
            unchecked.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Input</h2>
            <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
              <button
                onClick={handleSaveToNote}
                disabled={
                  savingNote || !columns.some((column) => column.text.trim())
                }
                title="Saves exactly what's pasted here, so you can listen again later — not the current speed, order, or which languages are checked"
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

          <div className="max-h-112 space-y-4 overflow-y-auto pr-1">
            {columns.map((column, index) => (
              <div key={column.id}>
                <div className="mb-2 flex items-center gap-2">
                  <label
                    title="Include in playback"
                    className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400"
                  >
                    <input
                      type="checkbox"
                      checked={column.included}
                      onChange={(event) =>
                        updateColumn(column.id, {
                          included: event.target.checked,
                        })
                      }
                      className="accent-indigo-600"
                    />
                    Play
                  </label>
                  <LanguageCombobox
                    value={column.name}
                    onChange={(next) =>
                      updateColumn(column.id, { name: next })
                    }
                    placeholder={`Language ${index + 1}`}
                    wrapperClassName="flex-1"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleRemoveLanguage(column.id)}
                    disabled={columns.length <= 1}
                    title="Remove this language"
                    className="rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-bold text-zinc-400 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-zinc-800 disabled:hover:text-zinc-400"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  value={column.text}
                  onChange={(event) =>
                    updateColumn(column.id, { text: event.target.value })
                  }
                  placeholder={`Paste your ${column.name || "text"} here...`}
                  className="h-32 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleAddLanguage}
            className="mt-4 w-full rounded-lg border border-dashed border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-indigo-500 hover:text-indigo-400"
          >
            + Add language
          </button>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">
            Browser support
          </h3>
          <p className="text-sm text-zinc-500">
            Playback uses your browser&apos;s built-in text-to-speech
            (<code className="text-zinc-400">speechSynthesis</code>), which is
            well supported in Chrome, Edge, Firefox, and Safari — this is a
            different, much more reliable API than speech-to-text
            (dictation), so this feature doesn&apos;t have the same
            browser-support gaps that dictation would. What can still vary by
            browser and operating system is which languages have a
            good-quality voice installed, and how reliably a language gets
            recognized from its name — an unrecognized name simply falls back
            to your browser&apos;s default voice rather than failing.
          </p>
        </div>

        {parsed && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            {/* Sticky so Play/Pause/Stop stay reachable without scrolling
                back up (Question 232) — same bg-zinc-900 as the card
                itself so text scrolled underneath disappears behind it,
                not just visually behind a transparent bar. */}
            <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900 pb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-zinc-100">
                  Preview
                </h2>
                {readingOrder === "sentence" ? (
                  <div className="flex overflow-hidden rounded-md border border-zinc-700">
                    <button
                      onClick={() => setViewMode("table")}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        viewMode === "table"
                          ? "bg-indigo-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Table
                    </button>
                    <button
                      onClick={() => setViewMode("vertical")}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        viewMode === "vertical"
                          ? "bg-indigo-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Vertical
                    </button>
                  </div>
                ) : (
                  <span
                    title="Table view doesn't apply here — languages aren't aligned to a shared sentence count in this mode."
                    className="text-xs font-medium text-zinc-500"
                  >
                    Vertical, grouped by language
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-zinc-500">
                  {includedCount} of {columns.length} language
                  {columns.length !== 1 ? "s" : ""} will be read
                </span>
                <label
                  title="Sentence by sentence: sentence 1 in every checked language, then sentence 2, and so on. Language by language: the whole first checked language, then the whole next one."
                  className="flex items-center gap-1.5 text-sm text-zinc-400"
                >
                  Order
                  <select
                    value={readingOrder}
                    onChange={(event) =>
                      setReadingOrder(event.target.value as ReadingOrder)
                    }
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                  >
                    <option value="sentence">Sentence by sentence</option>
                    <option value="language">Language by language</option>
                  </select>
                </label>
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
                    disabled={includedCount === 0}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    ▶ Play
                  </button>
                ) : paused ? (
                  <button
                    onClick={handleResume}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    ▶ Resume
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    ⏸ Pause
                  </button>
                )}
                <button
                  onClick={handleStop}
                  disabled={!playing}
                  className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ■ Stop
                </button>
              </div>
            </div>

            {playbackError && (
              <p className="mb-4 text-sm text-red-400">{playbackError}</p>
            )}

            {playing && current && (
              <p className="mb-4 text-sm text-indigo-400">
                {paused ? "Paused at" : "Reading"} sentence{" "}
                {current.index + 1} ·{" "}
                {columns[current.col]?.name.trim() ||
                  `Language ${current.col + 1}`}
              </p>
            )}

            {effectiveViewMode === "table" ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-zinc-800">
                  <thead>
                    <tr className="bg-zinc-800">
                      {columns.map((column, idx) => (
                        <th
                          key={column.id}
                          className="border border-zinc-800 px-4 py-2 text-left font-semibold text-zinc-300"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={
                                column.included
                                  ? "text-zinc-100"
                                  : "text-zinc-600"
                              }
                            >
                              {column.name.trim() || `Language ${idx + 1}`}
                              {!column.included && " (skipped)"}
                            </span>
                            {columns.length > 1 && (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleMove(idx, -1)}
                                  disabled={idx === 0}
                                  title="Move column left"
                                  className="rounded px-1.5 py-1 text-xs font-bold text-indigo-400 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-700"
                                >
                                  ←
                                </button>
                                <button
                                  onClick={() => handleMove(idx, 1)}
                                  disabled={idx === columns.length - 1}
                                  title="Move column right"
                                  className="rounded px-1.5 py-1 text-xs font-bold text-indigo-400 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-700"
                                >
                                  →
                                </button>
                              </div>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-zinc-800/60">
                        {row.map((text, colIdx) => {
                          const isSpeaking =
                            current?.index === rowIdx &&
                            current?.col === colIdx;
                          const canSeek =
                            !!text.trim() && !!columns[colIdx]?.included;
                          return (
                            <td
                              key={colIdx}
                              ref={(el) => {
                                if (isSpeaking) activeSentenceRef.current = el;
                              }}
                              onClick={
                                canSeek
                                  ? () =>
                                      handleSeekTo({
                                        index: rowIdx,
                                        col: colIdx,
                                      })
                                  : undefined
                              }
                              title={canSeek ? SEEK_HINT : undefined}
                              className={`border border-zinc-800 px-4 py-2 ${
                                canSeek ? "cursor-pointer" : ""
                              } ${
                                isSpeaking
                                  ? "bg-indigo-900/50 text-indigo-100 ring-1 ring-inset ring-indigo-500"
                                  : "text-zinc-300"
                              }`}
                            >
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : readingOrder === "language" ? (
              // Grouped by language, and within each language grouped by
              // paragraph exactly as pasted — not one row per sentence.
              // Sentence-level chunks still exist underneath (each gets its
              // own inline highlight as it's spoken), they're just displayed
              // running together the way the user actually wrote them,
              // instead of forced onto separate lines.
              <div className="space-y-6">
                {columns.map((column, colIdx) => {
                  const paragraphs = paragraphsByColumn[colIdx];
                  if (paragraphs.length === 0) return null;
                  const name = column.name.trim() || `Language ${colIdx + 1}`;
                  return (
                    <div key={column.id}>
                      <h3
                        className={`mb-1 text-sm font-semibold ${PREVIEW_COLORS[colIdx % PREVIEW_COLORS.length]}`}
                      >
                        {name}
                        {!column.included && " (skipped)"}
                      </h3>
                      <div className="space-y-2">
                        {paragraphs.map((sentences, paraIdx) => (
                          <p key={paraIdx} className="text-zinc-200">
                            {sentences.map((sentence, i) => {
                              const isSpeaking =
                                current?.index === sentence.index &&
                                current?.col === colIdx;
                              return (
                                <span key={sentence.index}>
                                  {i > 0 && " "}
                                  <span
                                    ref={(el) => {
                                      if (isSpeaking)
                                        activeSentenceRef.current = el;
                                    }}
                                    onClick={
                                      column.included
                                        ? () =>
                                            handleSeekTo({
                                              index: sentence.index,
                                              col: colIdx,
                                            })
                                        : undefined
                                    }
                                    title={
                                      column.included ? SEEK_HINT : undefined
                                    }
                                    className={`rounded px-1 py-0.5 ${
                                      column.included
                                        ? "cursor-pointer hover:bg-zinc-800"
                                        : ""
                                    } ${
                                      isSpeaking
                                        ? "bg-indigo-900/50 ring-1 ring-inset ring-indigo-500"
                                        : ""
                                    }`}
                                  >
                                    {sentence.text}
                                  </span>
                                </span>
                              );
                            })}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {parsed.rows.map((row, rowIdx) => (
                  <div key={rowIdx} className="space-y-1">
                    {row.map((text, colIdx) => {
                      if (!text) return null;
                      const column = columns[colIdx];
                      const isSpeaking =
                        current?.index === rowIdx && current?.col === colIdx;
                      const name =
                        column?.name.trim() || `Language ${colIdx + 1}`;
                      return (
                        <p
                          key={colIdx}
                          ref={(el) => {
                            if (isSpeaking) activeSentenceRef.current = el;
                          }}
                          onClick={
                            column?.included
                              ? () =>
                                  handleSeekTo({ index: rowIdx, col: colIdx })
                              : undefined
                          }
                          title={column?.included ? SEEK_HINT : undefined}
                          className={`rounded px-2 py-1 text-zinc-200 ${
                            column?.included
                              ? "cursor-pointer hover:bg-zinc-800/60"
                              : ""
                          } ${
                            isSpeaking
                              ? "bg-indigo-900/50 ring-1 ring-inset ring-indigo-500"
                              : ""
                          }`}
                        >
                          <span
                            className={`font-semibold ${PREVIEW_COLORS[colIdx % PREVIEW_COLORS.length]}`}
                          >
                            {name}
                            {!column?.included && " (skipped)"}:{" "}
                          </span>
                          {text}
                        </p>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
