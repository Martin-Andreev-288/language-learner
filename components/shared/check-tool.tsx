"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkWriting } from "@/app/actions/writing-check-actions";
import { createNote } from "@/app/actions/note-actions";
import { NotePage } from "@/app/generated/prisma";
import { describeClientError } from "@/lib/client-error";
import { WRITING_CHECK_MAX_CHARACTERS } from "@/lib/limits";
import CharacterCount from "@/components/shared/character-count";
import MicIcon from "@/components/shared/mic-icon";
import LanguageCombobox from "@/components/shared/language-combobox";
import { guessLanguageCode } from "@/lib/language-codes";
import { useSpeechToText } from "@/lib/use-speech-to-text";

// One tool behind both Writing Check and Speak Check (Question 285). They
// were the same code — the same action, the same correction rendering, the
// same note saving — differing only in how the text gets into the box and
// where the note goes. Keeping them as two files meant every later change
// to any of that had to be made twice, and could silently drift.
//
// Configured by *mode* rather than by a handful of independent props,
// because there are exactly two shapes here, not an open space of
// combinations: nothing wants dictation without a language field, and
// nothing wants Speak Check's copy filed under Writing notes. A table of
// the two variants side by side is easier to read — and harder to get
// subtly wrong — than six props spread across two call sites.
export type CheckMode = "writing" | "speaking";

interface ModeConfig {
  heading: string;
  description: string;
  placeholder: string;
  notePage: NotePage;
  noteTitle: string;
  // Brings the microphone *and* the language field with it. They aren't
  // separable: the language is what tells speech recognition which
  // language to listen for, so dictation without it would quietly fall
  // back to the browser's own and mis-hear everything (Answer 282).
  dictation: boolean;
}

const MODES: Record<CheckMode, ModeConfig> = {
  writing: {
    heading: "Writing Check",
    description:
      "Paste or write something, and get any mistakes — grammar, word choice, phrasing — pointed out with a corrected version and why.",
    placeholder: "Write or paste your text here...",
    notePage: NotePage.writing,
    noteTitle: "Writing Check",
    dictation: false,
  },
  speaking: {
    heading: "Speak Check",
    description:
      "Say something in the language you're learning, and get any mistakes pointed out with a corrected version and why. What you dictate stays editable — fix anything it mishears before checking.",
    placeholder: "Dictate, or write here directly…",
    notePage: NotePage.speaking,
    noteTitle: "Speak Check",
    dictation: true,
  },
};

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

export default function CheckTool({ mode }: { mode: CheckMode }) {
  const config = MODES[mode];

  const [language, setLanguage] = useState("");
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const langCode = guessLanguageCode(language);

  // Stable identity, and a functional update so the hook never has to be
  // re-told about the text on every keystroke.
  const handleFinalResult = useCallback((chunk: string) => {
    const spoken = chunk.trim();
    if (!spoken) return;
    setText((prev) => {
      // The browser returns chunks with no leading space, so joining
      // them naively runs the end of one sentence into the start of
      // the next.
      const joined = prev
        ? `${prev.replace(/\s+$/, "")} ${spoken}`
        : spoken;
      // `maxLength` on the textarea only governs *typing*. Nothing
      // stops a spoken chunk from pushing past the ceiling the check
      // itself enforces, which would turn a long dictation into a
      // rejected check.
      return joined.length <= WRITING_CHECK_MAX_CHARACTERS
        ? joined
        : joined.slice(0, WRITING_CHECK_MAX_CHARACTERS);
    });
  }, []);

  // Called in both modes because hooks can't be conditional — in writing
  // mode nothing ever starts it, so it costs one capability check and
  // otherwise sits idle.
  const {
    supported,
    listening,
    interimTranscript,
    error: dictationError,
    notice: dictationNotice,
    start,
    stop,
  } = useSpeechToText({ lang: langCode, onFinalResult: handleFinalResult });

  // Dictated text lands at the end, which is below the fold once there's
  // more than a few lines of it — so without this you'd be talking into a
  // box that looks like it stopped responding.
  useEffect(() => {
    if (!listening) return;
    const textarea = textareaRef.current;
    if (textarea) textarea.scrollTop = textarea.scrollHeight;
  }, [text, listening]);

  const canDictate = supported && langCode !== undefined;
  const dictateTitle = !supported
    ? "This browser doesn't support speech recognition — try Chrome, Edge, or Safari"
    : !langCode
     ? "Pick a language first, so dictation listens for the right one"
     : listening
      ? "Stop dictating"
      : `Dictate in ${language.trim()}`;

  function handleClear() {
    setText("");
    setCheckedText("");
    setCorrections(null);
    setCorrectedText(null);
    setCheckError(null);
    setNoteError(null);
  }

  async function handleCheck() {
    // Speaking and then checking is one gesture — leaving the microphone
    // live would keep appending to a passage already being checked.
    if (listening) stop();

    setChecking(true);
    setCheckError(null);
    try {
      // The language is passed along, not just used for recognition:
      // checkWriting already accepts it (the chat sends it the same
      // way), and a short dictated sentence is exactly the case where
      // guessing the language wrong turns every word into a "mistake".
      // In writing mode it's the empty string, which the action treats
      // exactly as it treated being given nothing at all.
      const result = await checkWriting(text, language);
      if (!result.ok) {
        setCheckError(result.error);
        setCorrections(null);
        setCorrectedText(null);
        return;
      }
      setCorrections(result.data.corrections);
      setCorrectedText(result.data.correctedText);
      setCheckedText(text);
    } catch (err) {
      setCheckError(describeClientError(err, "Check failed."));
      setCorrections(null);
      setCorrectedText(null);
    } finally {
      setChecking(false);
    }
  }

  async function handleSaveToNote() {
    if (!corrections || corrections.length === 0 || correctedText === null)
      return;

    setSavingNote(true);
    setNoteError(null);
    try {
      await createNote(
        config.notePage,
        config.noteTitle,
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
            {config.heading}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {config.description}
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div
            className={`mb-4 flex flex-wrap justify-between gap-4 ${
              config.dictation ? "items-end" : "items-center"
            }`}
          >
            <h2 className="text-lg font-semibold text-zinc-100">
              Text
            </h2>
            <div className="flex flex-wrap items-end gap-2 whitespace-nowrap">
              {config.dictation && (
                <>
                  <div>
                    <label
                      htmlFor="check-tool-language"
                      className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500"
                    >
                      Language
                    </label>
                    <LanguageCombobox
                      id="check-tool-language"
                      value={language}
                      onChange={setLanguage}
                      placeholder="e.g. German"
                      compact
                      wrapperClassName="w-40"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                    />
                  </div>
                  {/* Disabled rather than hidden when
                    unavailable (Answer 278): a missing
                    button reads as a missing feature,
                    while a disabled one with a reason
                    reads as a limitation. */}
                  <button
                    onClick={listening ? stop : start}
                    disabled={!canDictate}
                    title={dictateTitle}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      listening
                        ? "bg-red-600 text-white hover:bg-red-500"
                        : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    {listening ? (
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
                    ) : (
                      <MicIcon />
                    )}
                    {listening ? "Stop" : "Dictate"}
                  </button>
                </>
              )}
              <button
                onClick={handleClear}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Clear
              </button>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={WRITING_CHECK_MAX_CHARACTERS}
            placeholder={config.placeholder}
            className="h-48 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />
          <CharacterCount
            value={text}
            max={WRITING_CHECK_MAX_CHARACTERS}
          />

          {/* Kept out of the textarea's own value on purpose:
            interim results are rewritten on every syllable, so
            putting them in the editable field would rewrite it
            under the cursor of anyone typing. */}
          {listening && (
            <p className="mt-2 flex items-start gap-2 text-sm text-zinc-500">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="italic">
                {interimTranscript || "Listening…"}
              </span>
            </p>
          )}

          {/* Two different weights on purpose: an error is
            something to fix before dictation can work, a notice
            is just how this dictation ended. */}
          {dictationError && (
            <p className="mt-2 text-sm text-red-400">
              {dictationError}
            </p>
          )}
          {dictationNotice && !dictationError && (
            <p className="mt-2 text-sm text-zinc-500">
              {dictationNotice}
            </p>
          )}
          {config.dictation && !supported && (
            <p className="mt-2 text-sm text-amber-400">
              Dictation isn&apos;t available in this browser —
              try Chrome, Edge, or Safari. Writing here directly
              still works.
            </p>
          )}

          {checkError && (
            <p className="mt-3 text-sm text-red-400">
              {checkError}
            </p>
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">
                Result
              </h2>
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
                  {noteSaved
                    ? "Saved!"
                    : savingNote
                     ? "Saving…"
                     : "Save to a new note"}
                </button>
              )}
            </div>
            {noteError && (
              <p className="mb-3 text-sm text-red-400">
                {noteError}
              </p>
            )}

            {corrections.length === 0 ? (
              <p className="text-sm text-emerald-400">
                Looks good ✅
              </p>
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
                    const badge =
                      badgeByCorrectionIndex.get(index);
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
                            Not shown highlighted
                            above — the wording
                            didn&apos;t match the
                            original text exactly.
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
