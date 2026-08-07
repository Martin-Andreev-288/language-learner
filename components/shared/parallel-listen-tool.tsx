"use client";

import { useEffect, useRef, useState } from "react";
import { splitIntoSentences } from "@/lib/sentence-split";
import { readAndClearCarriedColumns } from "@/lib/parallel-listen-carry";

interface LanguageColumn {
  id: number;
  name: string;
  text: string;
  included: boolean;
}

interface AlignedRows {
  rows: string[][];
}

interface PlaybackPosition {
  row: number;
  col: number;
}

// Best-effort name → BCP-47 mapping so playback picks a matching voice when
// the browser has one. Column names are freeform text, not a fixed list, so
// this only ever improves the common case (someone types "German" or "De")
// — an unrecognized name simply falls back to the browser's default voice
// rather than blocking playback.
const LANGUAGE_CODES: Record<string, string> = {
  bulgarian: "bg-BG",
  bg: "bg-BG",
  german: "de-DE",
  deutsch: "de-DE",
  de: "de-DE",
  french: "fr-FR",
  français: "fr-FR",
  fr: "fr-FR",
  english: "en-US",
  en: "en-US",
  italian: "it-IT",
  italiano: "it-IT",
  it: "it-IT",
  spanish: "es-ES",
  español: "es-ES",
  es: "es-ES",
  portuguese: "pt-PT",
  pt: "pt-PT",
  russian: "ru-RU",
  ru: "ru-RU",
  polish: "pl-PL",
  pl: "pl-PL",
  romanian: "ro-RO",
  ro: "ro-RO",
  dutch: "nl-NL",
  nl: "nl-NL",
  greek: "el-GR",
  el: "el-GR",
  turkish: "tr-TR",
  tr: "tr-TR",
  ukrainian: "uk-UA",
  uk: "uk-UA",
  czech: "cs-CZ",
  cs: "cs-CZ",
  swedish: "sv-SE",
  sv: "sv-SE",
  finnish: "fi-FI",
  fi: "fi-FI",
  norwegian: "nb-NO",
  no: "nb-NO",
  danish: "da-DK",
  da: "da-DK",
  hungarian: "hu-HU",
  hu: "hu-HU",
  japanese: "ja-JP",
  ja: "ja-JP",
  chinese: "zh-CN",
  zh: "zh-CN",
  korean: "ko-KR",
  ko: "ko-KR",
  arabic: "ar-SA",
  ar: "ar-SA",
  hindi: "hi-IN",
  hi: "hi-IN",
  slovak: "sk-SK",
  sk: "sk-SK",
  slovenian: "sl-SI",
  sl: "sl-SI",
  croatian: "hr-HR",
  hr: "hr-HR",
  serbian: "sr-RS",
  sr: "sr-RS",
  bosnian: "bs-BA",
  bs: "bs-BA",
  macedonian: "mk-MK",
  mk: "mk-MK",
  albanian: "sq-AL",
  sq: "sq-AL",
  lithuanian: "lt-LT",
  lt: "lt-LT",
  latvian: "lv-LV",
  lv: "lv-LV",
  estonian: "et-EE",
  et: "et-EE",
  icelandic: "is-IS",
  vietnamese: "vi-VN",
  vi: "vi-VN",
  thai: "th-TH",
  th: "th-TH",
  indonesian: "id-ID",
  id: "id-ID",
  malay: "ms-MY",
  ms: "ms-MY",
  hebrew: "he-IL",
  he: "he-IL",
  persian: "fa-IR",
  farsi: "fa-IR",
  fa: "fa-IR",
  bengali: "bn-BD",
  bn: "bn-BD",
  tamil: "ta-IN",
  ta: "ta-IN",
  urdu: "ur-PK",
  ur: "ur-PK",
  welsh: "cy-GB",
  cy: "cy-GB",
  irish: "ga-IE",
  ga: "ga-IE",
  catalan: "ca-ES",
  ca: "ca-ES",
  basque: "eu-ES",
  eu: "eu-ES",
  georgian: "ka-GE",
  ka: "ka-GE",
  armenian: "hy-AM",
  hy: "hy-AM",
  filipino: "fil-PH",
  tagalog: "fil-PH",
  swahili: "sw-KE",
  sw: "sw-KE",
  afrikaans: "af-ZA",
  af: "af-ZA",
  brazilian: "pt-BR",
  "portuguese (brazil)": "pt-BR",
};

function guessLanguageCode(name: string): string | undefined {
  return LANGUAGE_CODES[name.trim().toLowerCase()];
}

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
  const [current, setCurrent] = useState<PlaybackPosition | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
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

  // Playback is driven entirely by the browser's speechSynthesis queue, not
  // React state — this only cancels it if the page is left mid-playback.
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
    setCurrent(null);
  }

  // Speaks queueRef.current[index] and chains to the next index on end,
  // as long as playId is still the active run (a new one is minted whenever
  // playback is stopped, replayed, or restarted after a live speed change).
  function speakFrom(index: number, playId: number) {
    const queue = queueRef.current;
    if (index >= queue.length) {
      setPlaying(false);
      setCurrent(null);
      return;
    }
    currentIndexRef.current = index;
    const item = queue[index];
    setCurrent(item.position);
    const utterance = new SpeechSynthesisUtterance(item.text);
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

  function handlePlay() {
    if (!parsed) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlaybackError("Playback isn't supported in this browser.");
      return;
    }

    const includedIndexes = columns
      .map((column, idx) => (column.included ? idx : -1))
      .filter((idx) => idx !== -1);
    if (includedIndexes.length === 0) {
      setPlaybackError("Check at least one language to play.");
      return;
    }

    const queue: {
      position: PlaybackPosition;
      text: string;
      lang?: string;
    }[] = [];
    parsed.rows.forEach((row, rowIdx) => {
      includedIndexes.forEach((colIdx) => {
        const text = row[colIdx];
        if (text.trim()) {
          queue.push({
            position: { row: rowIdx, col: colIdx },
            text,
            lang: guessLanguageCode(columns[colIdx].name),
          });
        }
      });
    });

    if (queue.length === 0) {
      setPlaybackError("Nothing to play for the checked languages.");
      return;
    }

    setPlaybackError(null);
    queueRef.current = queue;
    window.speechSynthesis.cancel();
    const playId = ++playbackIdRef.current;
    setPlaying(true);
    speakFrom(0, playId);
  }

  // Web Speech doesn't let you retune an utterance already being spoken —
  // unlike a <video>/<audio> element's playbackRate, there's no live knob on
  // a SpeechSynthesisUtterance in flight. The closest honest equivalent:
  // interrupt immediately and re-speak the current sentence at the new
  // rate, then carry on from there — so the new speed takes effect right
  // away instead of waiting for the (possibly still-slow) current sentence
  // to finish first.
  function handleRateChange(nextRate: number) {
    setRate(nextRate);
    rateRef.current = nextRate;
    if (!playing) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const playId = ++playbackIdRef.current;
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

  const parsed = parseColumns(columns);
  const includedCount = columns.filter((column) => column.included).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Parallel Listen
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste the same passage in two or more languages, choose which
            ones to hear, and listen to them sentence by sentence in the
            order the languages are arranged below — skipping the ones you
            leave unchecked.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Input</h2>
            <button
              onClick={handleClear}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              Clear
            </button>
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
                  <input
                    type="text"
                    value={column.name}
                    onChange={(event) =>
                      updateColumn(column.id, { name: event.target.value })
                    }
                    placeholder={`Language ${index + 1}`}
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Preview</h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-500">
                  {includedCount} of {columns.length} language
                  {columns.length !== 1 ? "s" : ""} will be read
                </span>
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
                <button
                  onClick={handlePlay}
                  disabled={playing || includedCount === 0}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  ▶ Play
                </button>
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
                Reading sentence {current.row + 1} ·{" "}
                {columns[current.col]?.name.trim() ||
                  `Language ${current.col + 1}`}
              </p>
            )}

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
                              column.included ? "text-zinc-100" : "text-zinc-600"
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
                          current?.row === rowIdx && current?.col === colIdx;
                        return (
                          <td
                            key={colIdx}
                            className={`border border-zinc-800 px-4 py-2 ${
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
          </div>
        )}
      </div>
    </div>
  );
}
