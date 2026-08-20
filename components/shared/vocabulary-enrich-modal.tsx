"use client";

import { useEffect, useState } from "react";
import LanguageCombobox from "@/components/shared/language-combobox";
import { type EnrichableField } from "@/lib/vocabulary-enrichment";

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
    hint: "Only fills words that don't already have one — never overwrites.",
  },
  { field: "level", label: "Level", hint: "CEFR: A1 to C2." },
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

// Everything except part of speech, per Answer 241.
const DEFAULT_FIELDS: EnrichableField[] = [
  "translation",
  "level",
  "nounInfo",
  "wordFamily",
  "synonyms",
  "aiExamples",
  "collocations",
];

export default function VocabularyEnrichModal({
  wordCount,
  running,
  error,
  onCancel,
  onConfirm,
}: {
  wordCount: number;
  running: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (fields: EnrichableField[], translateInto: string) => void;
}) {
  const [fields, setFields] = useState<EnrichableField[]>(DEFAULT_FIELDS);
  const [translateInto, setTranslateInto] = useState("");

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

  const wantsTranslation = fields.includes("translation");
  const missingLanguage = wantsTranslation && !translateInto.trim();
  const canConfirm = fields.length > 0 && !missingLanguage && !running;

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

        <div className="mt-4 space-y-2">
          {FIELD_LABELS.map(({ field, label, hint }) => (
            <label
              key={field}
              className="flex cursor-pointer gap-2.5 rounded-lg p-2 transition-colors hover:bg-zinc-800/60"
            >
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
            <LanguageCombobox
              id="enrich-translate-into"
              value={translateInto}
              onChange={setTranslateInto}
              placeholder="e.g. Bulgarian"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
            />
          </div>
        )}

        {fields.length === 0 && (
          <p className="mt-3 text-sm text-amber-400">
            Check at least one kind of information.
          </p>
        )}
        {missingLanguage && (
          <p className="mt-3 text-sm text-amber-400">
            Choose a language to translate into, or uncheck Translation.
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
            onClick={() => onConfirm(fields, translateInto)}
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
