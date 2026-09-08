"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  groupMarkedRuns,
  tokenizeWords,
  type MarkedRun,
  type TextToken,
} from "@/lib/clickable-words";
import {
  translateMarkedPhrases,
  type PhraseTranslation,
} from "@/app/actions/inline-translate-actions";
import { createNote } from "@/app/actions/note-actions";
import { addVocabularyEntries } from "@/app/actions/vocabulary-entry-actions";
import { NotePage } from "@/app/generated/prisma";
import {
  readInlineTranslateDraft,
  writeInlineTranslateDraft,
} from "@/lib/inline-translate-draft";
import { writeInlineListenCarry } from "@/lib/inline-listen-carry";
import { describeClientError } from "@/lib/client-error";
import {
  INLINE_TRANSLATE_MAX_CHARACTERS,
  INLINE_TRANSLATE_MAX_PHRASES,
} from "@/lib/limits";
import { MAX_TRANSLATION_LANGUAGES } from "@/lib/vocabulary-enrichment";
import { languageTag, languageTagLabel } from "@/lib/language-codes";
import CharacterCount from "@/components/shared/character-count";
import LanguageCombobox from "@/components/shared/language-combobox";

type TranslatedResult = {
  tokens: TextToken[];
  runs: MarkedRun[];
  // One phrase to everything it was translated into (Question 339).
  translations: Map<string, PhraseTranslation[]>;
};

// How a phrase's translations read inline, in the passage and in the text
// that Copy and Save-to-note produce.
//
// One language prints bare, exactly as it always has — a tag beside a
// single answer labels something nothing else is competing with, and
// nobody translating into one language should see their output change.
// Several print tagged and separated, the same shape the vocabulary
// Translations column uses, so the two places agree.
function formatTranslations(translations: PhraseTranslation[]) {
  if (translations.length === 0) return "";
  if (translations.length === 1) return translations[0].text;
  return translations
    .map(({ language, text }) => `${languageTagLabel(language)} ${text}`)
    .join(" · ");
}

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
  translations: PhraseTranslation[] | null;
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
        const translation = formatTranslations(
          result.translations.get(run.text) ?? [],
        );
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
        const translation = formatTranslations(
          result.translations.get(run.text) ?? [],
        );
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

export default function InlineTranslateTool({
  defaultTranslateLanguage,
}: {
  defaultTranslateLanguage: string;
}) {
  const router = useRouter();
  // Restored from the last session's draft, if there is one — read once,
  // as part of the initial state itself (each lazy initializer runs once,
  // at mount), not in an effect afterward, so there's no extra render.
  // Read into its own piece of state, same discipline as Inline Listen's
  // carry (Answer 171/225): sessionStorage.getItem has no clearing side
  // effect here the way a one-time carry does, but reading it once and
  // deriving every other initial value from that one snapshot still avoids
  // parsing the same JSON — and re-running tokenizeWords/groupMarkedRuns —
  // once per field for no reason.
  const [initialDraft] = useState(() => readInlineTranslateDraft());
  const [text, setText] = useState(() => initialDraft.text);
  const [sourceLanguage, setSourceLanguage] = useState(
    () => initialDraft.sourceLanguage,
  );
  // The draft wins over the default: a language you picked while working on
  // *this* passage is a deliberate choice about it, and shouldn't be
  // overruled by a general preference the next time the page opens. The
  // default only fills the gap when the draft has nothing to say.
  const [targetLanguages, setTargetLanguages] = useState<string[]>(() =>
    initialDraft.targetLanguages.length > 0
      ? initialDraft.targetLanguages
      : defaultTranslateLanguage.trim()
        ? [defaultTranslateLanguage.trim()]
        : [],
  );
  // Whatever is currently half-typed in the box, kept apart from the
  // chosen list for the same reason the enrich modal keeps its own draft
  // apart: "Germ" is not a language to translate into (Question 326).
  const [languageDraft, setLanguageDraft] = useState("");
  // Marked by token position, not word text — marking one occurrence of
  // "the" must not mark every "the" in the passage. Restored from the
  // draft's stored positions, valid against the text restored above since
  // both came from the same saved snapshot.
  const [markedIndices, setMarkedIndices] = useState<Set<number>>(
    () => new Set(initialDraft.markedIndices),
  );
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [showTranslations, setShowTranslations] = useState(true);
  // Rebuilt from the draft's saved [phrase, translation] pairs, not stored
  // as tokens/runs directly — those are cheap to recompute from the
  // restored text and marks with the same calls handleTranslate already
  // uses, so there's no second, possibly-stale copy of them sitting in
  // sessionStorage.
  const [result, setResult] = useState<TranslatedResult | null>(() => {
    if (initialDraft.translations.length === 0) return null;
    const tokens = tokenizeWords(initialDraft.text);
    const runs = groupMarkedRuns(tokens, new Set(initialDraft.markedIndices));
    if (runs.length === 0) return null;
    return { tokens, runs, translations: new Map(initialDraft.translations) };
  });
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
  // itself could derive, so this is the legitimate use of an effect. Marked
  // words and the last translation now persist too (Question 230/Iteration
  // C), so returning to this page no longer means re-translating from
  // scratch. Clearing already goes through this same path — handleClear
  // resets text/markedIndices/result, which lands here as an empty draft,
  // same as before.
  useEffect(() => {
    writeInlineTranslateDraft({
      text,
      sourceLanguage,
      targetLanguages,
      markedIndices: Array.from(markedIndices),
      translations: result ? Array.from(result.translations.entries()) : [],
    });
  }, [text, sourceLanguage, targetLanguages, markedIndices, result]);

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
      translations: null,
      error: null,
      addingVocab: false,
      addedVocab: false,
    });
    try {
      const result = await translateMarkedPhrases(
        [word],
        text,
        targetLanguages,
      );
      if (!result.ok) {
        setWordPopup((prev) =>
          prev && prev.word === word
            ? { ...prev, loading: false, error: result.error }
            : prev,
        );
        return;
      }
      const [translations] = result.data;
      setWordPopup((prev) =>
        prev && prev.word === word
          ? { ...prev, loading: false, translations }
          : prev,
      );
    } catch (err) {
      setWordPopup((prev) =>
        prev && prev.word === word
          ? {
              ...prev,
              loading: false,
              error: describeClientError(err, "Translation failed."),
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
      // One call per language rather than one call carrying all of them,
      // and that works because of what Question 333 built: a word that is
      // already saved still records the translation arriving with it. So
      // the first call creates the word and its first translation, and
      // each call after it adds only a translation. No new signature, no
      // second endpoint — just the capability already there, used.
      const popupTranslations = wordPopup.translations ?? [];
      if (popupTranslations.length === 0) {
        // Nothing came back to record, but the word is still worth
        // keeping: you clicked it because you didn't know it, and that
        // remains true whether or not the translation arrived.
        await addVocabularyEntries(word, sourceLanguage);
      } else {
        for (const { language, text: translated } of popupTranslations) {
          await addVocabularyEntries(
            word,
            sourceLanguage,
            translated,
            language,
          );
        }
      }
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

  // Same Add-button commit the enrich modal uses, and for the same
  // reason: the shared combobox reports typing and choosing through one
  // callback, so there is no way to tell them apart from out here.
  function addLanguage() {
    const language = languageDraft.trim();
    if (!language) return;
    setTargetLanguages((prev) => {
      if (prev.length >= MAX_TRANSLATION_LANGUAGES) return prev;
      const already = prev.some(
        (existing) => existing.toLowerCase() === language.toLowerCase(),
      );
      return already ? prev : [...prev, language];
    });
    setLanguageDraft("");
  }

  function removeLanguage(language: string) {
    setTargetLanguages((prev) =>
      prev.filter((existing) => existing !== language),
    );
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
      const result = await translateMarkedPhrases(
        uniquePhrases,
        text,
        targetLanguages,
      );
      if (!result.ok) {
        setTranslateError(result.error);
        return;
      }
      const translations = new Map(
        uniquePhrases.map((phrase, index) => [phrase, result.data[index]]),
      );
      setResult({ tokens, runs, translations });
      setShowTranslations(true);
    } catch (err) {
      setTranslateError(describeClientError(err, "Translation failed."));
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
      const title = targetLanguages.join(", ") || "Inline Translate";
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

    setAddingVocab(true);
    setVocabSummary(null);
    setNoteError(null);
    try {
      // One pass per language, for the reason spelled out in the popup's
      // own save above: the words are created by the first pass and merely
      // matched by the rest, each adding its own translation.
      //
      // The counts come from the first pass alone, and that is the honest
      // number rather than a convenient one: it is how many *words* were
      // added, which is what the sentence says. Later passes add
      // translations to words that already exist, and counting those as
      // "added" would claim the same word three times.
      let added = 0;
      let skipped = 0;
      let first = true;
      // Every chip removed after translating leaves a result with nothing
      // to file it under. The words still go in — they're what you marked
      // — just without translations attached.
      if (targetLanguages.length === 0) {
        const outcome = await addVocabularyEntries(
          uniqueRunTexts.join("\n"),
          sourceLanguage,
        );
        added = outcome.added;
        skipped = outcome.skipped;
        first = false;
      }
      for (const language of targetLanguages) {
        const lines = uniqueRunTexts.map(
          (runText) =>
            result.translations
              .get(runText)
              ?.find((item) => item.language === language)?.text ?? "",
        );
        const outcome = await addVocabularyEntries(
          uniqueRunTexts.join("\n"),
          sourceLanguage,
          lines.join("\n"),
          language,
        );
        if (first) {
          added = outcome.added;
          skipped = outcome.skipped;
          first = false;
        }
      }
      const languageNote =
        targetLanguages.length > 1
          ? `, each with ${targetLanguages.length} translations`
          : "";
      setVocabSummary(
        skipped > 0
          ? `Added ${added} to vocabulary${languageNote} (${skipped} already saved).`
          : `Added ${added} to vocabulary${languageNote}.`,
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
  // What the action will actually count: adjacent marked words collapse
  // into one phrase, so this is the number the limit applies to — not the
  // raw count of marked tokens, which would over-report.
  const markedPhraseCount = new Set(
    groupMarkedRuns(tokens, markedIndices).map((run) => run.text),
  ).size;

  // The cap divides by the number of languages, mirroring the action's own
  // rule: the response grows with phrases x languages, so sixty items into
  // one language and fifteen into four are the same amount of work.
  const maxPhrases = Math.max(
    1,
    Math.floor(INLINE_TRANSLATE_MAX_PHRASES / Math.max(1, targetLanguages.length)),
  );
  const languagesFull = targetLanguages.length >= MAX_TRANSLATION_LANGUAGES;
  const draftAlreadyChosen = targetLanguages.some(
    (existing) => existing.toLowerCase() === languageDraft.trim().toLowerCase(),
  );

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

          {/* maxLength stops the limit ever being exceeded rather than
              rejecting the request afterwards, and the counter below makes
              the ceiling visible before it's reached (Question 271). The
              server still enforces the same number — this is the field
              agreeing with it, not replacing it. */}
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={INLINE_TRANSLATE_MAX_CHARACTERS}
            placeholder="Paste your text here..."
            className="h-48 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />
          <CharacterCount
            value={text}
            max={INLINE_TRANSLATE_MAX_CHARACTERS}
          />

          <div className="mt-4 flex flex-wrap gap-4">
            <div>
              <label
                htmlFor="inline-translate-target-language"
                className="block text-sm font-semibold text-zinc-300"
              >
                Translate marked words into
              </label>

              {/* Chips above the field they were added from, exactly as the
                  vocabulary enrich modal does it (Question 326) — same
                  control, same place, so there is nothing new to learn
                  here. */}
              {targetLanguages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {targetLanguages.map((language) => (
                    <button
                      key={language}
                      type="button"
                      onClick={() => removeLanguage(language)}
                      title={`Stop translating into ${language}`}
                      className="flex items-center gap-1 rounded-full border border-indigo-800 bg-indigo-950/60 px-2 py-0.5 text-xs text-indigo-300 transition-colors hover:border-red-500 hover:text-red-400"
                    >
                      {language} ✕
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-2 flex w-full max-w-xs items-center gap-2">
                <LanguageCombobox
                  id="inline-translate-target-language"
                  value={languageDraft}
                  onChange={setLanguageDraft}
                  placeholder="e.g. German"
                  compact
                  wrapperClassName="min-w-0 flex-1"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={addLanguage}
                  disabled={
                    !languageDraft.trim() ||
                    languagesFull ||
                    draftAlreadyChosen
                  }
                  title={
                    languagesFull
                      ? `${MAX_TRANSLATION_LANGUAGES} languages at a time is the maximum`
                      : draftAlreadyChosen
                        ? "Already chosen"
                        : "Add this language"
                  }
                  className="shrink-0 rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {/* Says the phrase cap here rather than leaving it to be met
                  at Translate: with several languages it is a smaller
                  number than the one shown beside the passage. */}
              <p className="mt-1 max-w-xs text-xs text-zinc-600">
                {languagesFull
                  ? `That's the maximum of ${MAX_TRANSLATION_LANGUAGES} — remove one to add another.`
                  : targetLanguages.length > 1
                    ? `${targetLanguages.length} languages, so up to ${maxPhrases} marked items at a time.`
                    : `Up to ${MAX_TRANSLATION_LANGUAGES} at a time. Each marked word gets one translation per language.`}
              </p>
            </div>
            <div>
              <label
                htmlFor="inline-translate-source-language"
                title="The language the pasted text itself is written in — used when saving a word to vocabulary, since that saves the original word, not its translation, and when sending the passage to Inline Listen"
                className="block text-sm font-semibold text-zinc-300"
              >
                Source language{" "}
                <span className="font-normal text-zinc-500">
                  (for vocabulary and Inline Listen)
                </span>
              </label>
              <LanguageCombobox
                id="inline-translate-source-language"
                value={sourceLanguage}
                onChange={setSourceLanguage}
                placeholder="e.g. Italian"
                wrapperClassName="mt-2 w-full max-w-xs"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {text && (
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-100">
                Click the words you don&apos;t know
              </h2>
              {/* Shows the phrase cap only once it's close enough to
                  matter — marking a handful of words shouldn't come with a
                  running quota next to it. */}
              <span className="text-sm text-zinc-500">
                {markedPhraseCount >= maxPhrases * 0.75 ? (
                  <span
                    className={
                      markedPhraseCount > maxPhrases
                        ? "text-amber-400"
                        : undefined
                    }
                  >
                    {markedPhraseCount} of {maxPhrases} phrases
                  </span>
                ) : (
                  <>{markedIndices.size} marked</>
                )}{" "}
                · right-click a word for a quick translation
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
                {/* One language reads as a plain answer, several as a
                    labelled list — the popup is narrow, so tags on their
                    own lines beat a run-on of them (Question 339). */}
                {wordPopup.translations?.length === 1 ? (
                  <p className="text-zinc-200">
                    {wordPopup.translations[0].text}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {wordPopup.translations?.map((item) => (
                      <li key={item.language} className="text-zinc-200">
                        <span
                          title={item.language}
                          className="mr-1 rounded bg-zinc-800 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                        >
                          {languageTag(item.language)}
                        </span>
                        {item.text}
                      </li>
                    ))}
                  </ul>
                )}
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
