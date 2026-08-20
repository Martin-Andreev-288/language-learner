"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addVocabularyEntries,
  deleteVocabularyEntry,
  updateVocabularyEntry,
} from "@/app/actions/vocabulary-entry-actions";
import LanguageCombobox from "@/components/shared/language-combobox";
import VocabularyEnrichModal from "@/components/shared/vocabulary-enrich-modal";
import { enrichVocabularyEntries } from "@/app/actions/vocabulary-enrich-actions";
import {
  MAX_ENRICH_WORDS,
  type EnrichableField,
} from "@/lib/vocabulary-enrichment";

interface VocabularyEntryData {
  id: string;
  word: string;
  translation: string | null;
  language: string;
  firstSeen: string | Date;
  level: string | null;
  nounInfo: string | null;
  partOfSpeech: string | null;
  wordFamily: string | null;
  synonyms: string | null;
  aiExamples: string | null;
  collocations: string | null;
}

// Which of the AI-generated fields an entry actually has, in display order.
// Iteration 1 shows these plainly under the word; the collapsed-badge and
// expand-per-row treatment is Iteration 2's job.
const ENRICHMENT_LABELS: [keyof VocabularyEntryData, string][] = [
  ["level", "Level"],
  ["partOfSpeech", "Part of speech"],
  ["wordFamily", "Word family"],
  ["synonyms", "Synonyms"],
  ["aiExamples", "Examples"],
  ["collocations", "Collocations"],
];

type SortBy = "recent" | "alphabetical";

function formatDate(date: string | Date) {
  const parsed = new Date(date);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}.${month}.${year}`;
}

export default function VocabularyWordList({
  entries,
}: {
  entries: VocabularyEntryData[];
}) {
  const router = useRouter();
  const [words, setWords] = useState("");
  const [language, setLanguage] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSummary, setAddSummary] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Only one row editable at a time — same one-card-at-a-time principle
  // Vocab Shuffle's own edit uses, just applied to a list of rows instead
  // of a single card.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editTranslation, setEditTranslation] = useState("");
  const [editLanguage, setEditLanguage] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Selection for enrichment, by entry id — same Set-of-ids shape Inline
  // Translate's word marking uses, for the same reason: selecting one
  // occurrence must not select anything else that merely looks like it.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [enrichModalOpen, setEnrichModalOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichSummary, setEnrichSummary] = useState<string | null>(null);

  async function handleAdd() {
    if (!words.trim() || !language.trim()) {
      setAddError("At least one word and a language are required.");
      return;
    }

    setAdding(true);
    setAddError(null);
    setAddSummary(null);
    try {
      const { added, skipped } = await addVocabularyEntries(words, language);
      setWords("");
      setAddSummary(
        skipped > 0
          ? `Added ${added} word${added !== 1 ? "s" : ""} (${skipped} already saved).`
          : `Added ${added} word${added !== 1 ? "s" : ""}.`,
      );
      router.refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn't add those words — try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteVocabularyEntry(id);
      router.refresh();
    } catch {
      setAddError("Couldn't delete that entry — try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleEnrich(
    fields: EnrichableField[],
    translateInto: string,
  ) {
    setEnriching(true);
    setEnrichError(null);
    try {
      const { updated, requested } = await enrichVocabularyEntries(
        Array.from(selectedIds),
        { fields, translateInto },
      );
      setEnrichModalOpen(false);
      setSelectedIds(new Set());
      setEnrichSummary(
        updated < requested
          ? `Added information to ${updated} of ${requested} words.`
          : `Added information to ${updated} word${updated !== 1 ? "s" : ""}.`,
      );
      router.refresh();
    } catch (err) {
      setEnrichError(
        err instanceof Error
          ? err.message
          : "Couldn't generate that information — try again.",
      );
    } finally {
      setEnriching(false);
    }
  }

  function handleStartEdit(entry: VocabularyEntryData) {
    setEditingId(entry.id);
    setEditWord(entry.word);
    setEditTranslation(entry.translation ?? "");
    setEditLanguage(entry.language);
    setEditError(null);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    if (!editWord.trim() || !editLanguage.trim()) {
      setEditError("Word and language can't be empty.");
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      await updateVocabularyEntry(editingId, {
        word: editWord,
        translation: editTranslation,
        language: editLanguage,
      });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Couldn't save — try again.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  // Sorted, de-duplicated straight from what's actually saved — no separate
  // list to keep in sync, and it only ever offers languages you actually
  // have words in.
  const availableLanguages = Array.from(
    new Set(entries.map((entry) => entry.language)),
  ).sort((a, b) => a.localeCompare(b));

  // Language is an exact match picked from a dropdown, not part of the free
  // -text search — searching "En" as text used to also match any word
  // containing those two letters ("entertain," "listen"), which stopped
  // being usable once the list grew. Text search now only looks at the
  // word and its translation.
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleEntries = entries
    .filter(
      (entry) =>
        (languageFilter === "all" || entry.language === languageFilter) &&
        (!normalizedSearch ||
          entry.word.toLowerCase().includes(normalizedSearch) ||
          (entry.translation?.toLowerCase().includes(normalizedSearch) ??
            false)),
    )
    .sort((a, b) =>
      sortBy === "alphabetical"
        ? a.word.localeCompare(b.word)
        : new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime(),
    );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Vocabulary
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Every word you save lands here, whatever it came from — typed in
            by hand or added from another tool. One shared list.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">
            Add words
          </h2>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">
            Words{" "}
            <span className="normal-case font-normal text-zinc-600">
              (one per line — same as Vocab Shuffle)
            </span>
          </label>
          <textarea
            value={words}
            onChange={(event) => setWords(event.target.value)}
            placeholder={"substantial\nnevertheless\nreluctant"}
            className="h-28 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
          />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="vocabulary-add-language"
                className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Language
              </label>
              <LanguageCombobox
                id="vocabulary-add-language"
                value={language}
                onChange={setLanguage}
                placeholder="e.g. German"
                wrapperClassName="w-full max-w-xs"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="rounded-lg bg-indigo-600 px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && (
            <p className="mt-3 text-sm text-red-400">{addError}</p>
          )}
          {addSummary && (
            <p className="mt-3 text-sm text-emerald-400">{addSummary}</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">
              {entries.length} word{entries.length !== 1 ? "s" : ""}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search word or translation…"
                className="w-48 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
              />
              <select
                value={languageFilter}
                onChange={(event) => setLanguageFilter(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
              >
                <option value="all">All languages</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortBy)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
              >
                <option value="recent">Recently added</option>
                <option value="alphabetical">A–Z</option>
              </select>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-900/60 bg-indigo-950/30 px-4 py-2.5">
              <span className="text-sm text-zinc-300">
                {selectedIds.size} of {MAX_ENRICH_WORDS} selected
                {selectedIds.size >= MAX_ENRICH_WORDS && (
                  <span className="text-zinc-500">
                    {" "}
                    — that&apos;s the maximum
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded-md px-3 py-1 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    setEnrichError(null);
                    setEnrichSummary(null);
                    setEnrichModalOpen(true);
                  }}
                  className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  Add information…
                </button>
              </div>
            </div>
          )}

          {enrichSummary && (
            <p className="mb-4 text-sm text-emerald-400">{enrichSummary}</p>
          )}
          {enrichError && !enrichModalOpen && (
            <p className="mb-4 text-sm text-red-400">{enrichError}</p>
          )}

          {entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-600">
              No words saved yet — add one above.
            </p>
          ) : visibleEntries.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-600">
              {normalizedSearch
                ? `No words match "${searchTerm.trim()}"`
                : "No words match this filter"}
              {languageFilter !== "all" ? ` in ${languageFilter}.` : "."}
            </p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {visibleEntries.map((entry) =>
                editingId === entry.id ? (
                  <div key={entry.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={editWord}
                        onChange={(event) => setEditWord(event.target.value)}
                        placeholder="Word"
                        className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={editTranslation}
                        onChange={(event) =>
                          setEditTranslation(event.target.value)
                        }
                        placeholder="Translation (optional)"
                        className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                      />
                      <LanguageCombobox
                        value={editLanguage}
                        onChange={setEditLanguage}
                        placeholder="Language"
                        compact
                        className="w-32 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                      />
                      <button
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        className="shrink-0 rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={savingEdit}
                        className="shrink-0 rounded-md bg-zinc-800 px-3 py-1 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                    {editError && (
                      <p className="mt-2 text-sm text-red-400">{editError}</p>
                    )}
                  </div>
                ) : (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-4 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.id)}
                      onChange={() => toggleSelected(entry.id)}
                      // Selecting past the cap is blocked here rather than
                      // rejected after the fact by the action, so the limit
                      // is visible while choosing instead of being a
                      // surprise at generate time.
                      disabled={
                        !selectedIds.has(entry.id) &&
                        selectedIds.size >= MAX_ENRICH_WORDS
                      }
                      title={
                        !selectedIds.has(entry.id) &&
                        selectedIds.size >= MAX_ENRICH_WORDS
                          ? `${MAX_ENRICH_WORDS} words at a time is the maximum`
                          : "Select for adding information"
                      }
                      className="mt-1 shrink-0 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-30"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-zinc-100">
                        {entry.word}
                      </span>
                      {/* Sits inline beside the word rather than behind
                          "Details" with the other generated fields: gender
                          and plural read as part of identifying the noun at
                          a glance, which is the whole point of keeping it
                          this short (Question 246). Stored separately from
                          `word` all the same — see the schema comment. */}
                      {entry.nounInfo && (
                        <span
                          title="Gender and plural"
                          className="ml-1.5 font-medium text-zinc-100"
                        >
                          {entry.nounInfo}
                        </span>
                      )}
                      {entry.translation && (
                        <span className="ml-2 text-zinc-400">
                          — {entry.translation}
                        </span>
                      )}
                      <span className="ml-2 text-sm text-zinc-500">
                        {entry.language}
                      </span>
                      {ENRICHMENT_LABELS.some(([field]) => entry[field]) && (
                        <dl className="mt-1.5 space-y-0.5 text-xs">
                          {ENRICHMENT_LABELS.filter(
                            ([field]) => entry[field],
                          ).map(([field, label]) => (
                            <div key={field} className="flex gap-2">
                              <dt className="shrink-0 text-zinc-600">
                                {label}
                              </dt>
                              <dd className="min-w-0 whitespace-pre-line text-zinc-400">
                                {String(entry[field])}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-zinc-600">
                      {formatDate(entry.firstSeen)}
                    </span>
                    <button
                      onClick={() => handleStartEdit(entry)}
                      title="Edit"
                      className="shrink-0 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-indigo-300"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      title="Delete"
                      className="shrink-0 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {enrichModalOpen && (
        <VocabularyEnrichModal
          wordCount={selectedIds.size}
          running={enriching}
          error={enrichError}
          onCancel={() => setEnrichModalOpen(false)}
          onConfirm={handleEnrich}
        />
      )}
    </div>
  );
}
