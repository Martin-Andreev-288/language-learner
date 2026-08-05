"use client";

import { useRef, useState } from "react";
import { checkWriting } from "@/app/actions/writing-check-actions";
import { createNote } from "@/app/actions/note-actions";
import { NotePage } from "@/app/generated/prisma";

type Correction = {
  original: string;
  corrected: string;
  explanation: string;
};

type CorrectionSpan = {
  start: number;
  end: number; // exclusive
  index: number; // index into the corrections array
};

// Finds each correction's `original` text inside the checked passage, so it
// can be highlighted in place. Not every correction is guaranteed to match —
// the model doesn't always quote the source verbatim — so this only returns
// the ones that do, in reading order, with overlapping matches dropped
// (first-found wins) rather than rendered as broken, nested highlights.
function findCorrectionSpans(
  checkedText: string,
  corrections: Correction[],
): CorrectionSpan[] {
  const found: CorrectionSpan[] = [];

  corrections.forEach((correction, index) => {
    if (!correction.original) return;
    const start = checkedText.indexOf(correction.original);
    if (start === -1) return;
    found.push({ start, end: start + correction.original.length, index });
  });

  found.sort((a, b) => a.start - b.start);

  const spans: CorrectionSpan[] = [];
  let lastEnd = -1;
  for (const span of found) {
    if (span.start >= lastEnd) {
      spans.push(span);
      lastEnd = span.end;
    }
  }

  return spans;
}

function renderHighlightedText(
  checkedText: string,
  spans: CorrectionSpan[],
  badgeByCorrectionIndex: Map<number, number>,
  onSpanClick: (correctionIndex: number) => void,
) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  spans.forEach((span) => {
    if (span.start > cursor) {
      nodes.push(checkedText.slice(cursor, span.start));
    }
    nodes.push(
      <mark
        key={span.start}
        onClick={() => onSpanClick(span.index)}
        title={`Correction ${badgeByCorrectionIndex.get(span.index)}`}
        className="cursor-pointer rounded bg-red-500/25 px-0.5 text-red-200 underline decoration-red-500 decoration-2 underline-offset-2 transition-colors hover:bg-red-500/40"
      >
        {checkedText.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });

  if (cursor < checkedText.length) {
    nodes.push(checkedText.slice(cursor));
  }

  return nodes;
}

// The point of saving this isn't "here's your fixed text" — correctedText
// already covers that — it's a record of what was actually wrong and why,
// meant to be read back later. So the note leads with the mistakes
// themselves, not the fully corrected passage.
function buildNoteContent(correctedText: string, corrections: Correction[]) {
  const correctionsMarkdown = corrections
    .map(
      (correction, index) =>
        `### ${index + 1}. ~~${correction.original}~~ → **${correction.corrected}**\n\n${correction.explanation}`,
    )
    .join("\n\n");

  return `${correctionsMarkdown}\n\n---\n\n### Fully corrected\n\n${correctedText}`;
}

export default function WritingCheckTool() {
  const [text, setText] = useState("");
  const [checkedText, setCheckedText] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[] | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [flashedIndex, setFlashedIndex] = useState<number | null>(null);
  const flashResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const noteResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  function handleClear() {
    setText("");
    setCheckedText("");
    setCorrections(null);
    setCorrectedText(null);
    setCheckError(null);
    setNoteError(null);
  }

  async function handleCheck() {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await checkWriting(text);
      setCorrections(result.corrections);
      setCorrectedText(result.correctedText);
      setCheckedText(text);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Check failed.");
      setCorrections(null);
      setCorrectedText(null);
    } finally {
      setChecking(false);
    }
  }

  async function handleSaveToNote() {
    if (!corrections || corrections.length === 0 || correctedText === null) return;

    setSavingNote(true);
    setNoteError(null);
    try {
      await createNote(
        NotePage.writing,
        "Writing Check",
        buildNoteContent(correctedText, corrections),
      );
      setNoteSaved(true);
      if (noteResetRef.current) clearTimeout(noteResetRef.current);
      noteResetRef.current = setTimeout(() => setNoteSaved(false), 2000);
    } catch {
      setNoteError("Couldn't save to Notes — try again.");
    } finally {
      setSavingNote(false);
    }
  }

  function handleSpanClick(correctionIndex: number) {
    document
      .getElementById(`correction-card-${correctionIndex}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashedIndex(correctionIndex);
    if (flashResetRef.current) clearTimeout(flashResetRef.current);
    flashResetRef.current = setTimeout(() => setFlashedIndex(null), 1500);
  }

  const spans = corrections
    ? findCorrectionSpans(checkedText, corrections)
    : [];
  const badgeByCorrectionIndex = new Map(
    spans.map((span, i) => [span.index, i + 1]),
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Writing Check
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste or write something, and get any mistakes — grammar, word
            choice, phrasing — pointed out with a corrected version and why.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Text</h2>
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
            placeholder="Write or paste your text here..."
            className="h-48 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />

          {checkError && (
            <p className="mt-3 text-sm text-red-400">{checkError}</p>
          )}

          <button
            onClick={handleCheck}
            disabled={checking || !text.trim()}
            className="mt-4 w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check"}
          </button>
        </div>

        {corrections && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Result</h2>
              {corrections.length > 0 && (
                <button
                  onClick={handleSaveToNote}
                  disabled={savingNote}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    noteSaved
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  } disabled:cursor-not-allowed`}
                >
                  {noteSaved ? "Saved!" : savingNote ? "Saving…" : "Save to a new note"}
                </button>
              )}
            </div>
            {noteError && (
              <p className="mb-3 text-sm text-red-400">{noteError}</p>
            )}

            {corrections.length === 0 ? (
              <p className="text-sm text-emerald-400">Looks good ✅</p>
            ) : (
              <>
                <p className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-200">
                  {renderHighlightedText(
                    checkedText,
                    spans,
                    badgeByCorrectionIndex,
                    handleSpanClick,
                  )}
                </p>

                {correctedText && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Fully corrected
                    </p>
                    <p className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm leading-relaxed text-emerald-100">
                      {correctedText}
                    </p>
                  </div>
                )}

                <ul className="mt-4 space-y-4">
                  {corrections.map((correction, index) => {
                    const badge = badgeByCorrectionIndex.get(index);
                    return (
                      <li
                        key={index}
                        id={`correction-card-${index}`}
                        className={`rounded-lg border p-4 transition-colors ${
                          flashedIndex === index
                            ? "border-indigo-500 bg-indigo-950/40"
                            : "border-zinc-800 bg-zinc-950"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {badge && (
                            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/30 text-xs font-bold text-red-200">
                              {badge}
                            </span>
                          )}
                          <p className="text-sm text-red-400 line-through decoration-red-500/60">
                            {correction.original}
                          </p>
                        </div>
                        <p className="mt-1 text-sm font-medium text-emerald-400">
                          {correction.corrected}
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          {correction.explanation}
                        </p>
                        {!badge && (
                          <p className="mt-2 text-xs text-zinc-600">
                            Not shown highlighted above — the wording didn&apos;t
                            match the original text exactly.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
