"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  groupMarkedRuns,
  tokenizeWords,
  type MarkedRun,
  type TextToken,
} from "@/lib/clickable-words";
import { translateMarkedPhrases } from "@/app/actions/inline-translate-actions";
import { createNote } from "@/app/actions/note-actions";
import { addVocabularyEntries } from "@/app/actions/vocabulary-entry-actions";
import { NotePage } from "@/app/generated/prisma";
import {
  readInlineTranslateDraft,
  writeInlineTranslateDraft,
} from "@/lib/inline-translate-draft";
import { writeInlineListenCarry } from "@/lib/inline-listen-carry";

type TranslatedResult = {
  tokens: TextToken[];
  runs: MarkedRun[];
  translations: Map<string, string>;
};

// Right-click's popup shows a plain translation of one word, not a
// definition — same shape of result as left-click's marking, just for one
// word at a time and without needing to press "Translate marked words"
// first. Deliberately not the dictionary-style lookup Vocabulary/Reading
// Shuffle uses elsewhere, per the decision in Question 203.
type WordPopup = {
  word: string;
  x: number;
  y: number;
  loading: boolean;
  translation: string | null;
  error: string | null;
  addingVocab: boolean;
  addedVocab: boolean;
};

function renderResult(result: TranslatedResult, showTranslations: boolean) {
  const runByStart = new Map(result.runs.map((run) => [run.startIndex, run]));
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < result.tokens.length) {
    const run = runByStart.get(i);
    if (run) {
      if (showTranslations) {
        const translation = result.translations.get(run.text);
        nodes.push(
          <span key={i}>
            <strong className="text-indigo-200">{run.text}</strong>
            {translation && <em className="text-zinc-400"> ({translation})</em>}
          </span>,
        );
      } else {
        nodes.push(<span key={i}>{run.text}</span>);
      }
      i = run.endIndex + 1;
    } else {
      nodes.push(result.tokens[i].text);
      i += 1;
    }
  }

  return nodes;
}

// Plain-text version of the same walk renderResult does, for Copy and
// Save to a new note — Markdown bold/italic so it renders as intended if
// pasted into this app's own Notes.
function getResultText(result: TranslatedResult, showTranslations: boolean) {
  const runByStart = new Map(result.runs.map((run) => [run.startIndex, run]));
  let output = "";
  let i = 0;

  while (i < result.tokens.length) {
    const run = runByStart.get(i);
    if (run) {
      if (showTranslations) {
        const translation = result.translations.get(run.text);
        output += `**${run.text}**`;
        if (translation) output += ` (*${translation}*)`;
      } else {
        output += run.text;
      }
      i = run.endIndex + 1;
    } else {
      output += result.tokens[i].text;
      i += 1;
    }
  }

  return output;
}

export default function InlineTranslateTool() {
  const router = useRouter();
  // Restored from the last session's draft, if there is one — read as part
  // of the initial state itself (each lazy initializer runs once, at
  // mount), not in an effect afterward, so there's no extra render.
  const [text, setText] = useState(() => readInlineTranslateDraft().text);
  const [sourceLanguage, setSourceLanguage] = useState(
    () => readInlineTranslateDraft().sourceLanguage,
  );
  const [targetLanguage, setTargetLanguage] = useState(
    () => readInlineTranslateDraft().targetLanguage,
  );
  // Marked by token position, not word text — marking one occurrence of
  // "the" must not mark every "the" in the passage.
  const [markedIndices, setMarkedIndices] = useState<Set<number>>(new Set());
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [showTranslations, setShowTranslations] = useState(true);
  const [result, setResult] = useState<TranslatedResult | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const noteResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [addingVocab, setAddingVocab] = useState(false);
  const [vocabSummary, setVocabSummary] = useState<string | null>(null);
  const [wordPopup, setWordPopup] = useState<WordPopup | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Keeps the draft in sync with what's on screen — genuinely a "sync React
  // state out to an external system" effect, not one computing state React
  // itself could derive, so this is the legitimate use of an effect
  useEffect(() => {
    writeInlineTranslateDraft({ text, sourceLanguage, targetLanguage });
  }, [text, sourceLanguage, targetLanguage]);

  // Left-click dismisses the popup when it lands outside it; right-clicks
  // are left alone here since onContextMenu already replaces the popup's
  // state wholesale for whichever word was just right-clicked.
  useEffect(() => {
    if (!wordPopup) return;

    function handlePointerDown(event: MouseEvent) {
      if (event.button !== 0) return;
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        setWordPopup(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setWordPopup(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [wordPopup]);

  async function handleWordRightClick(event: React.MouseEvent, word: string) {
    event.preventDefault();
    const x = event.clientX;
    const y = event.clientY;
    setWordPopup({
      word,
      x,
      y,
      loading: true,
      translation: null,
      error: null,
      addingVocab: false,
      addedVocab: false,
    });
    try {
      const [translation] = await translateMarkedPhrases(
        [word],
        text,
        targetLanguage,
      );
      setWordPopup((prev) =>
        prev && prev.word === word
          ? { ...prev, loading: false, translation }
          : prev,
      );
    } catch (err) {
      setWordPopup((prev) =>
        prev && prev.word === word
          ? {
              ...prev,
              loading: false,
              error: err instanceof Error ? err.message : "Translation failed.",
            }
          : prev,
      );
    }
  }

  // Saves the original word the popup is showing, under sourceLanguage —
  // not targetLanguage — since a vocabulary entry is a word you're learning
  // in that word's own language, alongside its already-loaded translation
  // (Question 214). addVocabularyEntries handles a single word fine; no
  // need for a separate single-word action.
  async function handleAddPopupWordToVocab() {
    if (!wordPopup) return;
    const word = wordPopup.word;
    setWordPopup((prev) =>
      prev && prev.word === word ? { ...prev, addingVocab: true } : prev,
    );
    try {
      await addVocabularyEntries(
        word,
        sourceLanguage,
        wordPopup.translation ?? undefined,
      );
      setWordPopup((prev) =>
        prev && prev.word === word
          ? { ...prev, addingVocab: false, addedVocab: true }
          : prev,
      );
    } catch (err) {
      setWordPopup((prev) =>
        prev && prev.word === word
          ? {
              ...prev,
              addingVocab: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Couldn't add to vocabulary.",
            }
          : prev,
      );
    }
  }

  function toggleWordAt(index: number) {
    setMarkedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function handleClear() {
    setText("");
    setMarkedIndices(new Set());
    setResult(null);
    setTranslateError(null);
    setWordPopup(null);
    setVocabSummary(null);
  }

  async function handleTranslate() {
    const tokens = tokenizeWords(text);
    const runs = groupMarkedRuns(tokens, markedIndices);

    if (runs.length === 0) {
      setTranslateError("Mark at least one word before translating.");
      return;
    }

    const uniquePhrases = Array.from(new Set(runs.map((run) => run.text)));

    setTranslating(true);
    setTranslateError(null);
    try {
      const translated = await translateMarkedPhrases(
        uniquePhrases,
        text,
        targetLanguage,
      );
      const translations = new Map(
        uniquePhrases.map((phrase, index) => [phrase, translated[index]]),
      );
      setResult({ tokens, runs, translations });
      setShowTranslations(true);
    } catch (err) {
      setTranslateError(
        err instanceof Error ? err.message : "Translation failed.",
      );
    } finally {
      setTranslating(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        getResultText(result, showTranslations),
      );
      setCopySuccess(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setNoteError(
        "Couldn't copy to the clipboard — copy the text manually instead.",
      );
    }
  }

  async function handleSaveToNote() {
    if (!result) return;

    setSavingNote(true);
    try {
      const title = targetLanguage.trim() || "Inline Translate";
      await createNote(
        NotePage.reading,
        title,
        getResultText(result, showTranslations),
      );
      setNoteSaved(true);
      setNoteError(null);
      if (noteResetRef.current) clearTimeout(noteResetRef.current);
      noteResetRef.current = setTimeout(() => setNoteSaved(false), 2000);
    } catch {
      setNoteError("Couldn't save to Notes — try again.");
    } finally {
      setSavingNote(false);
    }
  }

  // Adds every marked/translated run at once, rather than a button per
  // occurrence scattered through the passage — reuses the same bulk
  // endpoint the Vocabulary page's own paste-a-list box calls, one word or
  // phrase per line, all under the source language, each paired with its
  // already-translated line at the same position (Question 214).
  async function handleAddAllToVocab() {
    if (!result) return;

    const uniqueRunTexts = Array.from(
      new Set(result.runs.map((run) => run.text)),
    );
    const translationLines = uniqueRunTexts.map(
      (runText) => result.translations.get(runText) ?? "",
    );

    setAddingVocab(true);
    setVocabSummary(null);
    setNoteError(null);
    try {
      const { added, skipped } = await addVocabularyEntries(
        uniqueRunTexts.join("\n"),
        sourceLanguage,
        translationLines.join("\n"),
      );
      setVocabSummary(
        skipped > 0
          ? `Added ${added} to vocabulary (${skipped} already saved).`
          : `Added ${added} to vocabulary.`,
      );
    } catch (err) {
      setNoteError(
        err instanceof Error ? err.message : "Couldn't add to vocabulary.",
      );
    } finally {
      setAddingVocab(false);
    }
  }

  // Sends the translated passage when there is one, falling back to the
  // raw pasted text when nothing has been translated yet — so the button
  // still works before translating (Question 225) without throwing away
  // the translations once they exist (Question 227). It sends exactly the
  // same string Copy and "Save to a new note" produce, rather than a
  // third serialization invented for this one hop; Inline Listen shows
  // the translations and reads only the original words.
  function handleSendToInlineListen() {
    if (!text.trim()) return;
    writeInlineListenCarry({
      text: result ? getResultText(result, true) : text,
      sourceLanguage,
    });
    router.push("/listening/inline-listen");
  }

  const tokens = tokenizeWords(text);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Inline Translate
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste a passage, click the words you don&apos;t know, and get their
            translation inserted right next to them.
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
            placeholder="Paste your text here..."
            className="h-48 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />

          <div className="mt-4 flex flex-wrap gap-4">
            <label className="block text-sm font-semibold text-zinc-300">
              Translate marked words into
              <input
                type="text"
                value={targetLanguage}
                onChange={(event) => setTargetLanguage(event.target.value)}
                placeholder="e.g. German"
                className="mt-2 w-full max-w-xs rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />
            </label>
            <label
              title="The language the pasted text itself is written in — used when saving a word to vocabulary, since that saves the original word, not its translation, and when sending the passage to Inline Listen"
              className="block text-sm font-semibold text-zinc-300"
            >
              Source language{" "}
              <span className="font-normal text-zinc-500">
                (for vocabulary and Inline Listen)
              </span>
              <input
                type="text"
                value={sourceLanguage}
                onChange={(event) => setSourceLanguage(event.target.value)}
                placeholder="e.g. Italian"
                className="mt-2 w-full max-w-xs rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />
            </label>
          </div>
        </div>

        {text && (
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">
                Click the words you don&apos;t know
              </h2>
              <span className="text-sm text-zinc-500">
                {markedIndices.size} marked · right-click a word for a quick
                translation
              </span>
            </div>
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-zinc-100">
              {tokens.map((token, index) =>
                token.isWord ? (
                  <button
                    key={index}
                    type="button"
                    onClick={() => toggleWordAt(index)}
                    onContextMenu={(event) =>
                      handleWordRightClick(event, token.text)
                    }
                    title="Left-click: mark for batch translation. Right-click: translate just this word."
                    className={`cursor-pointer rounded p-0 transition-colors ${
                      markedIndices.has(index)
                        ? "bg-indigo-600/40 font-semibold text-indigo-200 underline decoration-indigo-400 decoration-2 underline-offset-2"
                        : "bg-transparent text-inherit hover:bg-indigo-600/20"
                    }`}
                  >
                    {token.text}
                  </button>
                ) : (
                  token.text
                ),
              )}
            </p>

            {translateError && (
              <p className="mt-3 text-sm text-red-400">{translateError}</p>
            )}

            <button
              onClick={handleTranslate}
              disabled={translating || markedIndices.size === 0}
              className="mt-4 w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {translating ? "Translating…" : "Translate marked words"}
            </button>
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">Result</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTranslations((value) => !value)}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                >
                  {showTranslations ? "Hide translations" : "Show translations"}
                </button>
                <button
                  onClick={handleAddAllToVocab}
                  disabled={addingVocab}
                  title="Adds every marked word or phrase above, under the source language"
                  className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed"
                >
                  {addingVocab ? "Adding…" : "Add all to vocabulary"}
                </button>
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
                <button
                  onClick={handleCopy}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    copySuccess
                      ? "bg-emerald-600 text-white"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                  }`}
                >
                  {copySuccess ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-zinc-100">
              {renderResult(result, showTranslations)}
            </p>
            {noteError && (
              <p className="mt-3 text-sm text-red-400">{noteError}</p>
            )}
            {vocabSummary && (
              <p className="mt-3 text-sm text-emerald-400">{vocabSummary}</p>
            )}
          </div>
        )}

        {/* Its own section, further down the page, deliberately separate
            from the Text panel above — sends the passage as pasted, with
            no marked-word translations woven in, so it's a distinct next
            step rather than something competing with the translate
            workflow at the top (Question 226). */}
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">
            Listen to this passage
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {result
              ? "Sends the translated passage above — the translations come along and stay visible, but only the original words are read aloud."
              : "Send it to Inline Listen and hear it read back sentence by sentence — no need to translate anything first."}
          </p>
          <button
            onClick={handleSendToInlineListen}
            disabled={!text.trim()}
            className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-indigo-500 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send to Inline Listen →
          </button>
        </div>

        {wordPopup && (
          <div
            ref={popupRef}
            style={{ left: wordPopup.x + 8, top: wordPopup.y + 8 }}
            className="fixed z-50 min-w-40 max-w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm shadow-2xl"
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="font-semibold text-indigo-200">
                {wordPopup.word}
              </span>
              <button
                onClick={() => setWordPopup(null)}
                aria-label="Close"
                className="text-zinc-500 transition-colors hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
            {wordPopup.loading ? (
              <p className="text-zinc-500">Translating…</p>
            ) : wordPopup.error ? (
              <p className="text-red-400">{wordPopup.error}</p>
            ) : (
              <>
                <p className="text-zinc-200">{wordPopup.translation}</p>
                <button
                  onClick={handleAddPopupWordToVocab}
                  disabled={wordPopup.addingVocab || wordPopup.addedVocab}
                  className={`mt-2 w-full rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    wordPopup.addedVocab
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  } disabled:cursor-not-allowed`}
                >
                  {wordPopup.addedVocab
                    ? "Added!"
                    : wordPopup.addingVocab
                      ? "Adding…"
                      : "+ Add to vocabulary"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
