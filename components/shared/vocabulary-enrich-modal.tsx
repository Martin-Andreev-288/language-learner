"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import LanguageCombobox from "@/components/shared/language-combobox";
import {
  isPerLanguageField,
  MAX_TRANSLATION_LANGUAGES,
  maxWordsForLanguageCount,
  USED_IN_HINTS,
  USED_IN_VALUES,
  type EnrichableField,
  type EnrichmentScope,
} from "@/lib/vocabulary-enrichment";
import {
  readDefaultEnrichmentScope,
  readEnrichmentScope,
  subscribeToEnrichmentScope,
  writeEnrichmentScope,
} from "@/lib/enrichment-scope";
import { WORD_CATEGORIES } from "@/lib/word-categories";

// Label and one-line explanation per field. Kept here rather than in the
// action, since these are purely what the user reads — the action's own
// per-field text is what the model reads, and the two shouldn't be forced
// to share wording.
const FIELD_LABELS: {
  field: EnrichableField;
  label: string;
  hint: string;
}[] = [
  {
    field: "translation",
    label: "Translation",
    hint: "Into as many languages as you like. Only fills what's missing — an existing translation is never overwritten.",
  },
  { field: "level", label: "Level", hint: "CEFR: A1 to C2." },
  {
    field: "usedIn",
    label: "Used in",
    hint: "The kind of situation the word belongs to — everyday speech, jargon, older texts. Not a ranking.",
  },
  {
    field: "category",
    label: "Category",
    hint: "The topic it belongs to, picked from your own list of sections.",
  },
  {
    field: "nounInfo",
    label: "Gender & plural",
    hint: "Nouns only, shown next to the word (e.g. “f, -n”). Skipped for anything that isn’t a noun.",
  },
  {
    field: "wordFamily",
    label: "Word family",
    hint: "Other words built from the same root.",
  },
  { field: "synonyms", label: "Synonyms", hint: "Words with a close meaning." },
  {
    field: "aiExamples",
    label: "Example sentences",
    hint: "2-3 sentences using the word naturally.",
  },
  {
    field: "collocations",
    label: "Collocations",
    hint: "Short reusable chunks the word commonly appears in.",
  },
  {
    field: "partOfSpeech",
    label: "Part of speech",
    // Stated plainly rather than quietly defaulted off — the reason it's
    // unchecked is a real accuracy limit, not a style preference.
    hint: "Off by default: without the sentence a word came from, this can only be its most common use.",
  },
];

// Everything except part of speech, used-in and category. Part of speech
// has been off since Answer 241 for an accuracy reason stated in its own
// hint; the other two are off because they were added later (Question 310)
// and turning on new work for everybody by default isn't a decision worth
// making silently.
const DEFAULT_FIELDS: EnrichableField[] = [
  "translation",
  "level",
  "nounInfo",
  "wordFamily",
  "synonyms",
  "aiExamples",
  "collocations",
];

const ALL_FIELDS = FIELD_LABELS.map((entry) => entry.field);

// The two fields whose values are chosen from a fixed list, and so are the
// two worth being able to read before you ask for them (Question 319).
// Everything else here is generated freely — there's no list of possible
// synonyms to go and look at.
//
// Shown from inside this modal rather than anywhere else because this is
// the moment the question comes up: you're deciding whether to ask for a
// category, and "what are the categories?" is a fair thing to want
// answered without leaving. The table's own filter can't answer it — it
// lists only the values already used by your words, which is deliberately
// a different and much shorter list.
const REFERENCE_LISTS: Partial<
  Record<EnrichableField, { title: string; entries: readonly string[] }>
> = {
  usedIn: { title: "The six kinds", entries: USED_IN_VALUES },
  category: {
    title: `All ${WORD_CATEGORIES.length} topics`,
    entries: WORD_CATEGORIES,
  },
};

// On-by-default first, off-by-default after, each group keeping the order
// above (Question 317). Before this, the two fields added in Question 310
// sat near the top while unchecked, above several checked ones, which made
// the list look shuffled rather than grouped.
//
// Derived from DEFAULT_FIELDS rather than from what's currently ticked,
// which is the whole reason nothing jumps: the order is a fact about the
// defaults, so it can't change while you're clicking. That makes it a
// module constant rather than something the component has to freeze when
// it opens.
const ORDERED_FIELDS = [
  ...FIELD_LABELS.filter((entry) => DEFAULT_FIELDS.includes(entry.field)),
  ...FIELD_LABELS.filter((entry) => !DEFAULT_FIELDS.includes(entry.field)),
];

const FIRST_OFF_BY_DEFAULT = ORDERED_FIELDS.find(
  (entry) => !DEFAULT_FIELDS.includes(entry.field),
)?.field;

export default function VocabularyEnrichModal({
  wordCount,
  running,
  error,
  onCancel,
  onConfirm,
  defaultTranslateLanguage,
}: {
  wordCount: number;
  running: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (
    fields: EnrichableField[],
    translateInto: string[],
    scope: EnrichmentScope,
  ) => void;
  defaultTranslateLanguage: string;
}) {
  const [fields, setFields] = useState<EnrichableField[]>(DEFAULT_FIELDS);
  // Only one list open at a time — two long lists at once would bury
  // the rest of the modal.
  const [openReference, setOpenReference] = useState<EnrichableField | null>(
    null,
  );
  // The chosen languages, and separately whatever is currently half-typed
  // in the box. Two pieces of state rather than one, because a language
  // only counts once it's been added — otherwise "Bulg" sitting unfinished
  // in the field would be sent as a language to translate into.
  //
  // The account default (Question 303) starts here already chosen rather
  // than merely prefilling the box, which is the difference multi-select
  // makes: with one field the default was the value, with several it's the
  // first of them, and the rest are added beside it.
  const [translateInto, setTranslateInto] = useState<string[]>(() =>
    defaultTranslateLanguage.trim() ? [defaultTranslateLanguage.trim()] : [],
  );
  const [languageDraft, setLanguageDraft] = useState("");
  // Read from storage rather than held in useState, so the choice you made
  // last time is already selected when the modal opens (Question 333). The
  // same useSyncExternalStore pattern the table's column layout uses, and
  // for the same reason: the value lives outside React and the server has
  // to render an honest default rather than guess at localStorage.
  const scope = useSyncExternalStore(
    subscribeToEnrichmentScope,
    readEnrichmentScope,
    readDefaultEnrichmentScope,
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !running) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, running]);

  function toggleField(field: EnrichableField) {
    setFields((prev) =>
      prev.includes(field)
        ? prev.filter((existing) => existing !== field)
        : [...prev, field],
    );
  }

  // Committed by the Add button rather than by typing, because the
  // combobox reports every keystroke through the same onChange it uses to
  // report a pick from its list — there's no way to tell "chose German"
  // from "has typed Germ" from the outside, and sending the half-typed one
  // as a language is worse than asking for one extra click. Left as it is
  // rather than teaching the shared combobox a new callback: four other
  // fields depend on it, and none of them needs one.
  function addLanguage() {
    const language = languageDraft.trim();
    if (!language) return;
    setTranslateInto((prev) => {
      if (prev.length >= MAX_TRANSLATION_LANGUAGES) return prev;
      const alreadyChosen = prev.some(
        (existing) => existing.toLowerCase() === language.toLowerCase(),
      );
      return alreadyChosen ? prev : [...prev, language];
    });
    setLanguageDraft("");
  }

  function removeLanguage(language: string) {
    setTranslateInto((prev) =>
      prev.filter((existing) => existing !== language),
    );
  }

  function selectAll() {
    setFields(ALL_FIELDS);
  }

  function clearAll() {
    setFields([]);
  }

  // Which of the checked fields are the per-language kind — the scope
  // control only governs those, since category and used-in describe the
  // meaning and are written once whatever it says.
  const perLanguageFields = fields.filter(isPerLanguageField);
  const showsScope = perLanguageFields.length > 0;
  const hasLanguages = translateInto.length > 0;
  // "Both" and "translated" need somewhere to translate into. Rather than
  // letting them be picked and then failing at Generate, they're disabled
  // with the reason said beside them.
  const scopeReachesTargets = scope !== "own" && hasLanguages;
  const enrichedLanguageCount = !showsScope
    ? 1
    : (scope === "translated" ? 0 : 1) +
      (scopeReachesTargets ? translateInto.length : 0);
  const maxWords = maxWordsForLanguageCount(enrichedLanguageCount);
  const tooManyWords = wordCount > maxWords;

  const allSelected = fields.length === ALL_FIELDS.length;
  const noneSelected = fields.length === 0;
  const wantsTranslation = fields.includes("translation");
  const missingLanguage = wantsTranslation && translateInto.length === 0;
  const scopeNeedsLanguage = showsScope && scope === "translated" && !hasLanguages;
  const canConfirm =
    fields.length > 0 &&
    !missingLanguage &&
    !scopeNeedsLanguage &&
    !tooManyWords &&
    !running;
  const languagesFull = translateInto.length >= MAX_TRANSLATION_LANGUAGES;
  const draftAlreadyChosen = translateInto.some(
    (existing) => existing.toLowerCase() === languageDraft.trim().toLowerCase(),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={() => !running && onCancel()}
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-100">
          Add information to {wordCount} word{wordCount !== 1 ? "s" : ""}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Only what you check here is generated — nothing else is requested or
          saved. You can add the rest later by editing a word.
        </p>

        <div className="mt-4 flex items-center justify-between gap-3 border-b border-zinc-800 pb-2">
          <span className="text-xs text-zinc-500">
            {fields.length} of {ALL_FIELDS.length} selected
          </span>
          {/* Two named actions rather than one toggle: with a default state
              already in play, a single "toggle all" button can't say which
              way it's about to go. Reopening the modal is the third state —
              it always comes back to the defaults. */}
          <span className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={selectAll}
              disabled={running || allSelected}
              className="font-medium text-indigo-400 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:text-zinc-700"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={running || noneSelected}
              className="font-medium text-zinc-400 transition-colors hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700"
            >
              Clear all
            </button>
          </span>
        </div>

        <div className="mt-2 space-y-2">
          {ORDERED_FIELDS.map(({ field, label, hint }) => (
            <div key={field}>
              {/* Says why the order changes here, rather than leaving the
                  break between the two groups looking accidental. */}
              {field === FIRST_OFF_BY_DEFAULT && (
                <p className="mb-1 mt-3 border-t border-zinc-800 pt-3 text-xs font-medium uppercase tracking-wider text-zinc-600">
                  Off by default
                </p>
              )}
            {/* The "?" is a sibling of the label, not inside it: a button
                within a <label> activates that label's checkbox as well as
                itself, so opening the list would have silently ticked the
                field every time. */}
            <div className="flex items-start gap-1 rounded-lg transition-colors hover:bg-zinc-800/60">
              <label className="flex min-w-0 flex-1 cursor-pointer gap-2.5 p-2">
                <input
                  type="checkbox"
                  checked={fields.includes(field)}
                  onChange={() => toggleField(field)}
                  disabled={running}
                  className="mt-0.5 shrink-0 accent-indigo-600"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-200">
                    {label}
                  </span>
                  <span className="block text-xs text-zinc-500">{hint}</span>
                </span>
              </label>
              {REFERENCE_LISTS[field] && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenReference((prev) => (prev === field ? null : field))
                  }
                  aria-expanded={openReference === field}
                  title={
                    openReference === field
                      ? "Hide the list"
                      : `See every value ${label.toLowerCase()} can take`
                  }
                  className={`mt-2 mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                    openReference === field
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  ?
                </button>
              )}
            </div>

            {openReference === field && REFERENCE_LISTS[field] && (
              <div className="mb-1 ml-8 mr-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {REFERENCE_LISTS[field]!.title}
                </p>
                {/* Scrolls rather than growing: sixty-three topics would
                    push the buttons at the bottom of this modal off the
                    screen entirely. */}
                <ul className="max-h-44 space-y-1 overflow-y-auto pr-1 text-xs text-zinc-400">
                  {REFERENCE_LISTS[field]!.entries.map((entry) => (
                    <li key={entry}>
                      <span className="text-zinc-300">{entry}</span>
                      {USED_IN_HINTS[entry] && (
                        <span className="text-zinc-600">
                          {" "}
                          — {USED_IN_HINTS[entry]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-zinc-600">
                  {field === "category"
                    ? "A word that fits none of these gets a short topic of its own instead."
                    : "Not a ranking — none of these is better than another."}
                </p>
              </div>
            )}
            </div>
          ))}
        </div>

        {wantsTranslation && (
          <div className="mt-3">
            <label
              htmlFor="enrich-translate-into"
              className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500"
            >
              Translate into
            </label>

            {/* The chosen languages sit above the field they were added
                from, so the list you're building stays visible while you
                add to it. Each is removable on its own — the whole point of
                several is that you'll want different ones on different
                batches. */}
            {translateInto.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {translateInto.map((language) => (
                  <button
                    key={language}
                    type="button"
                    onClick={() => removeLanguage(language)}
                    disabled={running}
                    title={`Don't translate into ${language}`}
                    className="flex items-center gap-1 rounded-full border border-indigo-800 bg-indigo-950/60 px-2 py-0.5 text-xs text-indigo-300 transition-colors hover:border-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {language} ✕
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <LanguageCombobox
                id="enrich-translate-into"
                value={languageDraft}
                onChange={setLanguageDraft}
                placeholder="e.g. Bulgarian"
                compact
                wrapperClassName="min-w-0 flex-1"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={addLanguage}
                disabled={
                  running ||
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
                className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add
              </button>
            </div>

            {/* Says what the cap is before you hit it, and why the Add
                button has gone dead once you have. */}
            <p className="mt-1 text-xs text-zinc-600">
              {languagesFull
                ? `That's the maximum of ${MAX_TRANSLATION_LANGUAGES} — remove one to add another.`
                : `Up to ${MAX_TRANSLATION_LANGUAGES} at a time. Each gets its own translation, kept per language.`}
            </p>
          </div>
        )}

        {/* Which languages the checked fields get generated in (Question
            328). Shown only when something it governs is actually checked
            — asking "in which languages?" about a batch that only wants a
            category is a question with no meaning.

            Category and used-in are named as staying put, because their
            absence from this choice is a deliberate answer rather than an
            oversight: they describe the meaning, and meaning is what
            translation preserves. */}
        {showsScope && (
          <div className="mt-4 border-t border-zinc-800 pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Generate for
            </p>
            <div className="flex overflow-hidden rounded-lg border border-zinc-700">
              {(
                [
                  { value: "own", label: "The word itself" },
                  { value: "translated", label: "Its translations" },
                  { value: "both", label: "Both" },
                ] as const
              ).map(({ value, label }) => {
                const needsLanguages = value !== "own" && !hasLanguages;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => writeEnrichmentScope(value)}
                    disabled={running || needsLanguages}
                    title={
                      needsLanguages
                        ? "Add a language to translate into first"
                        : undefined
                    }
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                      scope === value
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:text-zinc-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              {scope === "own"
                ? "Level, gender, synonyms and examples describe the word as you saved it."
                : `Each translation gets its own level, gender, synonyms and examples — “confusion” is a different word from “Verwirrung”${
                    scope === "both" ? ", and both are described" : ""
                  }.`}
              {" Category and used-in are written once either way — they describe the meaning, which every translation shares."}
            </p>
            {/* The word limit moves with how many languages each word is
                described in, so it's said here rather than discovered at
                Generate. */}
            {enrichedLanguageCount > 1 && (
              <p
                className={`mt-1 text-xs ${
                  tooManyWords ? "text-amber-400" : "text-zinc-600"
                }`}
              >
                {tooManyWords
                  ? `That's ${wordCount} words across ${enrichedLanguageCount} languages — ${maxWords} or fewer at a time, or choose fewer languages.`
                  : `${enrichedLanguageCount} languages per word, so up to ${maxWords} words in one go.`}
              </p>
            )}
          </div>
        )}

        {fields.length === 0 && (
          <p className="mt-3 text-sm text-amber-400">
            Check at least one kind of information.
          </p>
        )}
        {missingLanguage && (
          <p className="mt-3 text-sm text-amber-400">
            Add at least one language to translate into, or uncheck
            Translation.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={running}
            className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(fields, translateInto, scope)}
            disabled={!canConfirm}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
