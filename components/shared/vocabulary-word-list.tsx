"use client";

import { useEffect, useRef, useState } from "react";
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
  type EnrichmentDetailField,
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

// One description per generated field, covering both how it's displayed and
// how it's edited — a single list rather than one for each, so a label can't
// end up saying different things in the two places. Typed as its own key
// union rather than `keyof VocabularyEntryData` so indexing an entry with
// one of these is known to give `string | null`, not the wider
// `string | Date` the whole-entry key type would allow.
type EnrichmentKey = EnrichmentDetailField;

const ENRICHMENT_FIELDS: {
  field: EnrichmentKey;
  label: string;
  // Stored one value per line: a textarea when editing, a bullet list when
  // shown.
  multiline?: boolean;
  // `nounInfo` is the one field shown inline beside the word rather than in
  // the Details panel (Question 246) — still fully editable like the rest.
  inDetails?: boolean;
  placeholder?: string;
}[] = [
  { field: "level", label: "Level", inDetails: true, placeholder: "e.g. B2" },
  { field: "nounInfo", label: "Gender & plural", placeholder: "e.g. f, -n" },
  { field: "partOfSpeech", label: "Part of speech", inDetails: true },
  { field: "wordFamily", label: "Word family", inDetails: true },
  { field: "synonyms", label: "Synonyms", inDetails: true },
  {
    field: "aiExamples",
    label: "Examples",
    multiline: true,
    inDetails: true,
    placeholder: "One per line",
  },
  {
    field: "collocations",
    label: "Collocations",
    multiline: true,
    inDetails: true,
    placeholder: "One per line",
  },
];

const DETAIL_FIELDS = ENRICHMENT_FIELDS.filter((entry) => entry.inDetails);

function populatedEnrichment(entry: VocabularyEntryData) {
  return DETAIL_FIELDS.filter(({ field }) => entry[field]?.trim());
}

// "Enriched" means any generated field is filled, not just the ones behind
// Details — a word with only a gender and plural has had information added
// to it just as much as one with synonyms, and filtering it into the
// "not yet" bucket would send you to re-generate something it already has.
function hasEnrichment(entry: VocabularyEntryData) {
  return ENRICHMENT_FIELDS.some(({ field }) => entry[field]?.trim());
}

function emptyEnrichment(): Record<EnrichmentKey, string> {
  return Object.fromEntries(
    ENRICHMENT_FIELDS.map(({ field }) => [field, ""]),
  ) as Record<EnrichmentKey, string>;
}

type SortBy = "recent" | "alphabetical";
type EnrichmentFilter = "all" | "enriched" | "plain";
type ViewMode = "list" | "table";

// Only these two columns get a header filter (Question 254). Language is
// deliberately excluded: it's a required column, so its "no value" bucket
// could never have anything in it, and the Language dropdown above the
// table already filters by exactly this.
type FilterableColumn = "level" | "partOfSpeech";
const FILTERABLE_COLUMNS: FilterableColumn[] = ["level", "partOfSpeech"];

// The empty string stands for "this word has no value in this column".
// Safe as a sentinel precisely because every real value is trimmed and
// non-empty before it's stored, so it can never collide with one.
const NO_VALUE = "";

function columnValue(entry: VocabularyEntryData, field: FilterableColumn) {
  return entry[field]?.trim() || NO_VALUE;
}

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
  const [enrichmentFilter, setEnrichmentFilter] =
    useState<EnrichmentFilter>("all");
  // List stays the default: it's the everyday view, and Table only earns
  // its place when you want to compare several words' information at once
  // (Answer 241). A view preference, so nothing about it is persisted.
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  // Per-column value filters, Table view only. An empty set means "no
  // filter on this column" rather than "match nothing", so the initial
  // state shows everything.
  const [columnFilters, setColumnFilters] = useState<
    Record<FilterableColumn, Set<string>>
  >({ level: new Set(), partOfSpeech: new Set() });
  const [openFilter, setOpenFilter] = useState<FilterableColumn | null>(null);
  // Fixed coordinates rather than an absolutely-positioned child: the table
  // sits in an `overflow-x-auto` wrapper, and a container that clips one
  // axis clips the other too, so a panel hanging below the header would be
  // cut off. Same reason LanguageCombobox positions its dropdown this way.
  const [filterAnchor, setFilterAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Only one row editable at a time — same one-card-at-a-time principle
  // Vocab Shuffle's own edit uses, just applied to a list of rows instead
  // of a single card.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editTranslation, setEditTranslation] = useState("");
  const [editLanguage, setEditLanguage] = useState("");
  // All generated fields in one object rather than a useState per field —
  // seven separate ones would be pure noise, and this keeps adding a field
  // to ENRICHMENT_FIELDS enough on its own.
  const [editEnrichment, setEditEnrichment] =
    useState<Record<EnrichmentKey, string>>(emptyEnrichment);
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
  // Which rows have their generated information expanded. Purely
  // progressive disclosure — collapsing never hides the *fact* that a word
  // has data (the level pill and the Details toggle both stay put), which
  // is what Answer 240 ruled out. Nothing is persisted: this is a view
  // state, not a setting.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
      setAddError(
        err instanceof Error
          ? err.message
          : "Couldn't add those words — try again.",
      );
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

  function openColumnFilter(field: FilterableColumn, anchor: HTMLElement) {
    if (openFilter === field) {
      setOpenFilter(null);
      return;
    }
    const bounds = anchor.getBoundingClientRect();
    setFilterAnchor({ left: bounds.left, top: bounds.bottom + 4 });
    setOpenFilter(field);
  }

  function toggleColumnValue(field: FilterableColumn, value: string) {
    setColumnFilters((prev) => {
      const next = new Set(prev[field]);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...prev, [field]: next };
    });
  }

  function clearColumnFilter(field: FilterableColumn) {
    setColumnFilters((prev) => ({ ...prev, [field]: new Set() }));
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
    setEditEnrichment(
      Object.fromEntries(
        ENRICHMENT_FIELDS.map(({ field }) => [field, entry[field] ?? ""]),
      ) as Record<EnrichmentKey, string>,
    );
    setEditError(null);
  }

  function updateEditField(field: EnrichmentKey, value: string) {
    setEditEnrichment((prev) => ({ ...prev, [field]: value }));
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
        enrichment: editEnrichment,
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

  // Same close-on-outside-click, Escape, and scroll handling the language
  // picker uses — a fixed-positioned panel has to close when the page moves
  // under it, or it visually detaches from the header it belongs to.
  useEffect(() => {
    if (!openFilter) return;

    function close(event: Event) {
      const target = event.target as Node;
      if (filterPanelRef.current?.contains(target)) return;
      setOpenFilter(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenFilter(null);
    }

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openFilter]);

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
        (enrichmentFilter === "all" ||
          (enrichmentFilter === "enriched"
            ? hasEnrichment(entry)
            : !hasEnrichment(entry))) &&
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

  // Table view's own extra layer, applied on top of the shared filters
  // rather than folded into them — column filters are Table-view state
  // (Question 255), so switching to List must not silently hide words with
  // no column header on screen to explain why.
  const tableEntries = visibleEntries.filter((entry) =>
    FILTERABLE_COLUMNS.every((field) => {
      const chosen = columnFilters[field];
      return chosen.size === 0 || chosen.has(columnValue(entry, field));
    }),
  );

  // Options come from `visibleEntries` — what the shared filters allow —
  // not from `tableEntries`, so checking a value doesn't make the other
  // options in that same menu disappear underneath you.
  function columnOptions(field: FilterableColumn) {
    return Array.from(
      new Set(visibleEntries.map((entry) => columnValue(entry, field))),
    ).sort((a, b) =>
      a === NO_VALUE ? 1 : b === NO_VALUE ? -1 : a.localeCompare(b),
    );
  }

  const activeColumnFilters = FILTERABLE_COLUMNS.filter(
    (field) => columnFilters[field].size > 0,
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Vocabulary</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Every word you save lands here, whatever it came from — typed in by
            hand or added from another tool. One shared list.
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
          {addError && <p className="mt-3 text-sm text-red-400">{addError}</p>}
          {addSummary && (
            <p className="mt-3 text-sm text-emerald-400">{addSummary}</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-zinc-100">
                {entries.length} word{entries.length !== 1 ? "s" : ""}
              </h2>
              {/* Same segmented-toggle pattern Parallel Listen's own
                  Table/Vertical switch uses — this is a second way of
                  rendering the same already-filtered, already-sorted list,
                  not a second page or a second query. */}
              <div className="flex overflow-hidden rounded-md border border-zinc-700">
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === "list"
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  title="Compare several words' information side by side"
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === "table"
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Table
                </button>
              </div>
            </div>
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
                value={enrichmentFilter}
                onChange={(event) =>
                  setEnrichmentFilter(event.target.value as EnrichmentFilter)
                }
                title="Filter by whether a word has any generated information yet"
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
              >
                <option value="all">Enriched &amp; not</option>
                <option value="enriched">Enriched only</option>
                <option value="plain">Not yet enriched</option>
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
              {languageFilter !== "all" ? ` in ${languageFilter}` : ""}
              {enrichmentFilter === "enriched"
                ? " with information added yet."
                : enrichmentFilter === "plain"
                  ? " still waiting for information."
                  : "."}
            </p>
          ) : viewMode === "table" ? (
            <>
              {activeColumnFilters.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span>
                    Showing {tableEntries.length} of {visibleEntries.length}
                  </span>
                  {activeColumnFilters.map((field) => {
                    const label =
                      ENRICHMENT_FIELDS.find((item) => item.field === field)
                        ?.label ?? field;
                    return (
                      <button
                        key={field}
                        onClick={() => clearColumnFilter(field)}
                        title={`Clear the ${label.toLowerCase()} filter`}
                        className="rounded-full border border-indigo-800 bg-indigo-950/60 px-2 py-0.5 text-indigo-300 transition-colors hover:border-red-500 hover:text-red-400"
                      >
                        {label}: {columnFilters[field].size} ✕
                      </button>
                    );
                  })}
                </div>
              )}
              {tableEntries.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-600">
                  No words match the column filters — clear one above to see
                  more.
                </p>
              ) : (
                // The same visibleEntries the list renders — same filters, same
                // sort, same selection — just laid out for scanning across words
                // instead of down one. Deliberately read-only: editing stays in
                // List view rather than being rebuilt a second time here, since
                // the row-level edit form is far too tall to live in a cell.
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse border border-zinc-800 text-sm">
                    <thead>
                      <tr className="bg-zinc-800">
                        <th className="border border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300">
                          <span className="sr-only">Select</span>
                        </th>
                        <th className="border border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300">
                          Word
                        </th>
                        <th className="border border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300">
                          Translation
                        </th>
                        <th className="border border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300">
                          Language
                        </th>
                        {ENRICHMENT_FIELDS.map(({ field, label }) => {
                          const filterable = FILTERABLE_COLUMNS.includes(
                            field as FilterableColumn,
                          );
                          const active =
                            filterable &&
                            columnFilters[field as FilterableColumn].size > 0;
                          return (
                            <th
                              key={field}
                              className="border border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300"
                            >
                              {filterable ? (
                                <button
                                  onClick={(event) =>
                                    openColumnFilter(
                                      field as FilterableColumn,
                                      event.currentTarget,
                                    )
                                  }
                                  title={`Filter by ${label.toLowerCase()}`}
                                  className={`flex items-center gap-1 transition-colors hover:text-indigo-300 ${
                                    active ? "text-indigo-300" : ""
                                  }`}
                                >
                                  {label}
                                  <span className="text-[10px]">
                                    {active ? "▼" : "▾"}
                                  </span>
                                </button>
                              ) : (
                                label
                              )}
                            </th>
                          );
                        })}
                        <th className="border border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300">
                          Added
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-zinc-800/40">
                          <td className="border border-zinc-800 px-3 py-2 align-top">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(entry.id)}
                              onChange={() => toggleSelected(entry.id)}
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
                              className="accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-30"
                            />
                          </td>
                          <td className="whitespace-nowrap border border-zinc-800 px-3 py-2 align-top font-medium text-zinc-100">
                            {entry.word}
                          </td>
                          <td className="border border-zinc-800 px-3 py-2 align-top text-zinc-400">
                            {entry.translation}
                          </td>
                          <td className="whitespace-nowrap border border-zinc-800 px-3 py-2 align-top text-zinc-500">
                            {entry.language}
                          </td>
                          {ENRICHMENT_FIELDS.map(({ field, multiline }) => {
                            // A word with nothing generated yet simply leaves
                            // empty cells, rather than being excluded or given
                            // placeholder text — the gaps are the point of this
                            // view, since they show at a glance what's missing.
                            const value = entry[field]?.trim();
                            const lines = (value ?? "")
                              .split("\n")
                              .map((line) => line.trim())
                              .filter(Boolean);
                            return (
                              <td
                                key={field}
                                className="border border-zinc-800 px-3 py-2 align-top text-zinc-300"
                              >
                                {multiline && lines.length > 1 ? (
                                  <ul className="list-disc space-y-0.5 pl-4">
                                    {lines.map((line, lineIndex) => (
                                      <li key={lineIndex}>{line}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  lines[0]
                                )}
                              </td>
                            );
                          })}
                          <td className="whitespace-nowrap border border-zinc-800 px-3 py-2 align-top text-xs text-zinc-600">
                            {formatDate(entry.firstSeen)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
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
                    </div>

                    {/* Every generated field is editable here whether or not
                        it was ever generated — that's what makes "add the
                        parts I skipped in the modal" work without a separate
                        feature: an empty box is just a field waiting to be
                        typed into (Question 242). Emptying a filled one and
                        saving clears it, which is also why deleting a single
                        piece of information needs no delete action of its
                        own. */}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {ENRICHMENT_FIELDS.map(
                        ({ field, label, multiline, placeholder }) => {
                          const inputId = `${entry.id}-${field}`;
                          const value = editEnrichment[field];
                          return (
                            <div
                              key={field}
                              className={
                                multiline ? "sm:col-span-2" : undefined
                              }
                            >
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label
                                  htmlFor={inputId}
                                  className="text-xs font-medium uppercase tracking-wider text-zinc-500"
                                >
                                  {label}
                                </label>
                                {value.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => updateEditField(field, "")}
                                    title={`Clear ${label} — takes effect when you save`}
                                    className="text-xs text-zinc-600 transition-colors hover:text-red-400"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                              {multiline ? (
                                <textarea
                                  id={inputId}
                                  value={value}
                                  onChange={(event) =>
                                    updateEditField(field, event.target.value)
                                  }
                                  placeholder={placeholder}
                                  className="h-20 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                                />
                              ) : (
                                <input
                                  id={inputId}
                                  type="text"
                                  value={value}
                                  onChange={(event) =>
                                    updateEditField(field, event.target.value)
                                  }
                                  placeholder={placeholder}
                                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                                />
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>

                    {editError && (
                      <p className="mt-3 text-sm text-red-400">{editError}</p>
                    )}

                    {/* Below the form rather than up in the word row: with
                        this many fields, Save sitting at the top would mean
                        scrolling back up to commit what you just typed. */}
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <p className="mr-auto text-xs text-zinc-600">
                        Emptying a field removes it when you save.
                      </p>
                      <button
                        onClick={handleCancelEdit}
                        disabled={savingEdit}
                        className="rounded-md bg-zinc-800 px-3 py-1 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                    </div>
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
                      {entry.level && (
                        <span
                          title="CEFR level"
                          className="ml-2 rounded-full border border-indigo-800 bg-indigo-950/60 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-300"
                        >
                          {entry.level}
                        </span>
                      )}
                      {populatedEnrichment(entry).length > 0 && (
                        <button
                          onClick={() => toggleExpanded(entry.id)}
                          aria-expanded={expandedIds.has(entry.id)}
                          className="ml-2 text-xs text-zinc-500 transition-colors hover:text-indigo-300"
                        >
                          Details {expandedIds.has(entry.id) ? "▴" : "▾"}
                        </button>
                      )}
                      {expandedIds.has(entry.id) && (
                        <dl className="mt-2 space-y-2 rounded-lg bg-zinc-950/60 p-3 text-xs">
                          {populatedEnrichment(entry).map(
                            ({ field, label }) => {
                              // Multi-value fields are stored one per line, so
                              // anything with line breaks renders as a list
                              // rather than a wall of text. Single-line values
                              // (level, part of speech, and the comma-separated
                              // ones) stay as they are.
                              const lines = (entry[field] ?? "")
                                .split("\n")
                                .map((line) => line.trim())
                                .filter(Boolean);
                              return (
                                <div key={field}>
                                  <dt className="font-medium uppercase tracking-wider text-zinc-600">
                                    {label}
                                  </dt>
                                  <dd className="mt-0.5 text-zinc-300">
                                    {lines.length > 1 ? (
                                      <ul className="list-disc space-y-0.5 pl-4">
                                        {lines.map((line, lineIndex) => (
                                          <li key={lineIndex}>{line}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      lines[0]
                                    )}
                                  </dd>
                                </div>
                              );
                            },
                          )}
                        </dl>
                      )}
                    </div>
                    {/* Grouped and centered against each other, not
                        against the row as a whole — the row itself stays
                        `items-start` so the word column can grow tall when
                        expanded, but the date's plain text and the buttons'
                        own padding don't share a height, so top-aligning
                        them individually left the date sitting visibly
                        above the button glyphs (Question 246). */}
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs text-zinc-600">
                        {formatDate(entry.firstSeen)}
                      </span>
                      <button
                        onClick={() => handleStartEdit(entry)}
                        title="Edit"
                        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-indigo-300"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deletingId === entry.id}
                        title="Delete"
                        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {openFilter && filterAnchor && (
        <div
          ref={filterPanelRef}
          style={{ left: filterAnchor.left, top: filterAnchor.top }}
          className="fixed z-50 max-h-72 w-56 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-1">
            <span className="text-xs font-semibold text-zinc-500">
              {ENRICHMENT_FIELDS.find((item) => item.field === openFilter)
                ?.label ?? openFilter}
            </span>
            {columnFilters[openFilter].size > 0 && (
              <button
                onClick={() => clearColumnFilter(openFilter)}
                className="text-xs text-zinc-500 transition-colors hover:text-red-400"
              >
                Clear
              </button>
            )}
          </div>
          {columnOptions(openFilter).map((value) => (
            <label
              key={value || "(none)"}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
            >
              <input
                type="checkbox"
                checked={columnFilters[openFilter].has(value)}
                onChange={() => toggleColumnValue(openFilter, value)}
                className="shrink-0 accent-indigo-600"
              />
              {/* The "no value" bucket is offered like any other option,
                  since "which words still have nothing here" is one of the
                  more useful things to filter for (Question 254). */}
              {value === NO_VALUE ? (
                <span className="italic text-zinc-500">(none)</span>
              ) : (
                value
              )}
            </label>
          ))}
        </div>
      )}

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
