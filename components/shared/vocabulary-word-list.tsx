"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  addVocabularyEntries,
  deleteVocabularyEntry,
  updateVocabularyEntry,
} from "@/app/actions/vocabulary-entry-actions";
import LanguageCombobox from "@/components/shared/language-combobox";
import VocabularyEnrichModal from "@/components/shared/vocabulary-enrich-modal";
import VocabularyToShuffleModal, {
  type CardContent,
} from "@/components/shared/vocabulary-to-shuffle-modal";
import {
  appendCardsToShuffleList,
  createShuffleListWithCards,
} from "@/app/actions/shuffle-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import { enrichVocabularyEntries } from "@/app/actions/vocabulary-enrich-actions";
import { checkWriting } from "@/app/actions/writing-check-actions";
import {
  MAX_ENRICH_WORDS,
  PER_LANGUAGE_FIELDS,
  type EnrichableField,
  type EnrichmentDetailField,
  type EnrichmentScope,
  type PerLanguageField,
} from "@/lib/vocabulary-enrichment";
import { describeClientError } from "@/lib/client-error";
import { languageTag, languageTagLabel } from "@/lib/language-codes";
import { VOCABULARY_MAX_WORDS } from "@/lib/limits";
import {
  moveColumn,
  DEFAULT_COLUMN_LAYOUT,
  readColumnLayout,
  readDefaultColumnLayout,
  subscribeToColumnLayout,
  toggleColumn,
  writeColumnLayout,
  type ConfigurableColumn,
} from "@/lib/vocabulary-columns";

interface TranslationData {
  id: string;
  language: string;
  text: string;
  level: string | null;
  nounInfo: string | null;
  partOfSpeech: string | null;
  wordFamily: string | null;
  synonyms: string | null;
  aiExamples: string | null;
  collocations: string | null;
  ownExample: string | null;
}

interface VocabularyEntryData {
  id: string;
  word: string;
  language: string;
  firstSeen: string | Date;
  level: string | null;
  nounInfo: string | null;
  partOfSpeech: string | null;
  wordFamily: string | null;
  synonyms: string | null;
  aiExamples: string | null;
  collocations: string | null;
  usedIn: string | null;
  category: string | null;
  ownExample: string | null;
  // One row per target language (Question 326), each carrying its own
  // generated fields since Question 335 — a translation is a word in a
  // language, so it has its own level, gender, synonyms and examples.
  translations: TranslationData[];
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
  {
    field: "usedIn",
    label: "Used in",
    inDetails: true,
    placeholder: "e.g. Everyday conversation",
  },
  {
    field: "category",
    label: "Category",
    inDetails: true,
    placeholder: "e.g. Animals",
  },
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
  {
    field: "ownExample",
    label: "Your sentence",
    multiline: true,
    inDetails: true,
    placeholder: "Write a sentence using this word",
  },
];

const DETAIL_FIELDS = ENRICHMENT_FIELDS.filter((entry) => entry.inDetails);

// The same descriptors, narrowed to the fields a translation carries too
// (Question 335). Derived from the one list rather than written out again,
// so a label can't say one thing under the word and another under its
// French form — they're the same field asked in a different language.
const TRANSLATION_FIELDS = ENRICHMENT_FIELDS.filter((entry) =>
  (PER_LANGUAGE_FIELDS as readonly string[]).includes(entry.field),
) as {
  field: PerLanguageField;
  label: string;
  multiline?: boolean;
  placeholder?: string;
}[];

// Whether a translation has anything beyond its text worth showing.
function populatedTranslationFields(translation: TranslationData) {
  return TRANSLATION_FIELDS.filter(({ field }) => translation[field]?.trim());
}

// Every configurable column's label in one place, so the header and the
// column chooser can't end up calling the same column two different things.
const COLUMN_LABELS: Record<ConfigurableColumn, string> = {
  translations: "Translations",
  language: "Language",
  added: "Added",
  ...(Object.fromEntries(
    ENRICHMENT_FIELDS.map(({ field, label }) => [field, label]),
  ) as Record<EnrichmentKey, string>),
};

function populatedEnrichment(entry: VocabularyEntryData) {
  return DETAIL_FIELDS.filter(({ field }) => entry[field]?.trim());
}

// "Enriched" means any generated field is filled, not just the ones behind
// Details — a word with only a gender and plural has had information added
// to it just as much as one with synonyms, and filtering it into the
// "not yet" bucket would send you to re-generate something it already has.
function hasEnrichment(entry: VocabularyEntryData) {
  return (
    ENRICHMENT_FIELDS.some(({ field }) => entry[field]?.trim()) ||
    // A word translated into three languages has had information added to
    // it whatever else is empty, so the "not yet enriched" filter mustn't
    // keep offering it up as untouched (Question 326).
    entry.translations.length > 0
  );
}

function emptyEnrichment(): Record<EnrichmentKey, string> {
  return Object.fromEntries(
    ENRICHMENT_FIELDS.map(({ field }) => [field, ""]),
  ) as Record<EnrichmentKey, string>;
}

type SortBy = "recent" | "alphabetical";
type EnrichmentFilter = "all" | "enriched" | "plain";
type ViewMode = "list" | "table";

// Every column that can be filtered, and how (Question 309). Started as
// just Level and Part of speech (Question 254); the rest are here now
// because "which words still have no translation" is as reasonable a
// question as "which words are B2", and there was no reason beyond effort
// that only two columns could answer their version of it.
//
// The `kind` is the whole design. Level and Part of speech have a handful
// of repeating values worth listing, so you pick from them. Everything else
// is different on every word — nobody wants to scroll a list of every word
// family you own — so those offer only the question actually worth asking:
// is there something here, or not.
//
// Language is still deliberately absent: it's required, so its "nothing
// here" bucket could never hold anything, and the Language dropdown above
// the table already does the other half.
// A third kind since Question 327, and it earns being its own rather than
// reusing "values": for every other column, ticking a value asks "which
// words say this?" — one question with one answer. Translations carry the
// other half too, and it's the half that's actually useful when you're
// deciding what to work on next: "which words are still missing Italian?"
// A values filter can't ask that, because a word missing Italian has no
// Italian value to tick.
//
// So this kind carries a mode alongside its ticks — has, or missing — and
// the same set of languages answers both questions depending on which way
// the switch is thrown.
type FilterKind = "values" | "presence" | "languages";

type FilterableColumn =
  | "translations"
  | "level"
  | "nounInfo"
  | "partOfSpeech"
  | "wordFamily"
  | "synonyms"
  | "aiExamples"
  | "collocations"
  | "usedIn"
  | "category"
  | "ownExample";

const FILTERABLE_COLUMNS: {
  field: FilterableColumn;
  label: string;
  kind: FilterKind;
  // One column holds more than one value at a time, comma-separated —
  // see columnValues below.
  multi?: boolean;
}[] = [
  { field: "translations", label: "Translations", kind: "languages" },
  { field: "level", label: "Level", kind: "values" },
  { field: "nounInfo", label: "Gender & plural", kind: "presence" },
  { field: "partOfSpeech", label: "Part of speech", kind: "values" },
  // Both take repeating values from a known set, so both list them rather
  // than only asking whether there's anything there — exactly the reason
  // Level and Part of speech do.
  { field: "usedIn", label: "Used in", kind: "values" },
  { field: "category", label: "Category", kind: "values", multi: true },
  { field: "wordFamily", label: "Word family", kind: "presence" },
  { field: "synonyms", label: "Synonyms", kind: "presence" },
  { field: "aiExamples", label: "Examples", kind: "presence" },
  { field: "collocations", label: "Collocations", kind: "presence" },
  { field: "ownExample", label: "Your sentence", kind: "presence" },
];

const FILTER_BY_FIELD = new Map(
  FILTERABLE_COLUMNS.map((column) => [column.field, column]),
);

// The empty string stands for "this word has no value in this column".
// Safe as a sentinel precisely because every real value is trimmed and
// non-empty before it's stored, so it can never collide with one.
const NO_VALUE = "";

// A presence column's entire domain is two buckets, which is exactly what a
// value filter already handles — so it reuses that machinery rather than
// getting a second mechanism of its own. Everything downstream (the chosen
// sets, the panel, the chips, the row filtering) stays one code path.
//
// No collision risk from the sentinel: filters are held per column, and
// this string is only ever produced for a column whose kind is "presence",
// where no real value is ever offered.
const HAS_VALUE = "present";

// A semicolon, not the comma that synonyms and word family use, and this
// is not a style choice: 36 of the 63 topic names contain a comma of their
// own — "Sea, water terms, vacation, leave" is one topic, not four. A
// comma separator shredded more than half the list into fragments, so
// filtering by a topic whose name contained a comma matched nothing at
// all. No topic contains a semicolon (Question 320).
const MULTI_VALUE_SEPARATOR = ";";

// Returns a list rather than one value, because a word can sit in two
// topics at once (Question 320). Every other column returns a list of one,
// which keeps the filter to a single code path — a multi-value column is
// just a value column that happens to answer with more than one, the same
// way a presence column is a value column with only two possible answers.
//
// The alternative was matching the stored text exactly, which is what this
// used to do: a word saved with two topics would have been a third thing,
// findable under neither of them.
function columnValues(
  entry: VocabularyEntryData,
  column: { field: FilterableColumn; kind: FilterKind; multi?: boolean },
  shown: Set<string>,
): string[] {
  // The one column whose values aren't in a column at all — they're rows in
  // another table, so this reads the languages a word has translations in
  // rather than splitting a string (Question 327). No "(none)" bucket:
  // "has no translations at all" is already answerable as "missing" every
  // language, and offering both would be two names for one question.
  //
  // Narrowed like every other column since Question 348. Answer 347
  // exempted it, and that was two arguments wearing one coat: hiding
  // languages from the *filter* would indeed make "which words are missing
  // Italian" unanswerable, but that was never a reason to leave the *cell*
  // showing four languages while every column beside it showed one.
  //
  // Narrowing both is the version with one rule instead of an exception to
  // remember, and "missing Italian" isn't lost — it's one click away, in
  // the same control that hid Italian. Asking it while looking only at
  // French was a contradiction anyway.
  if (column.kind === "languages") {
    return entry.translations
      .map((translation) => translation.language)
      .filter((language) => shown.size === 0 || shown.has(language));
  }

  // A field answered once per language reads every form rather than only
  // the word's own (Question 347). Matching stays `some`, the rule this
  // filter has always used — a word counts as B1 if any form it is being
  // shown in is B1, the same way it counts under a topic it carries.
  if (PER_LANGUAGE_FIELD_SET.has(column.field)) {
    const forms = fieldForms(entry, column.field as PerLanguageField, shown);
    if (column.kind === "presence") {
      return [forms.length > 0 ? HAS_VALUE : NO_VALUE];
    }
    const values = forms.map((form) => form.value.trim()).filter(Boolean);
    return values.length > 0 ? values : [NO_VALUE];
  }

  // Category and used-in, which describe the meaning and so have only ever
  // had the word's own answer (Question 333).
  const raw = entry[column.field as EnrichmentKey]?.trim() || NO_VALUE;
  if (column.kind === "presence") return [raw ? HAS_VALUE : NO_VALUE];
  if (!column.multi || !raw) return [raw];
  const parts = raw
    .split(MULTI_VALUE_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [NO_VALUE];
}

function optionLabel(kind: FilterKind, value: string) {
  if (kind === "presence") return value === NO_VALUE ? "Missing" : "Has one";
  return value;
}

// What a shuffle card ends up saying (Question 307).
//
// Laid out exactly as the vocabulary list already shows a word — the word,
// then its gender and plural, then an em dash and the translation — so a
// card looks like the row it came from rather than like a third format
// invented for the occasion.
//
// A word missing whichever part you asked for is added on its own rather
// than skipped or padded with an empty gap: you asked for the translation
// where there is one, not for only the words that have one.
//
// Several languages print tagged and separated the way the Translations
// column shows them (`fr premier · it primo`), rather than run together —
// a card carrying three translations should still read as three answers
// (Question 333). One language prints bare, since a tag beside a single
// answer labels something nothing else is competing with.
function buildCardText(
  entry: VocabularyEntryData,
  content: { nounInfo: boolean; languages: string[] },
) {
  let text = entry.word;
  if (content.nounInfo && entry.nounInfo?.trim()) {
    text += ` ${entry.nounInfo.trim()}`;
  }
  const chosen = entry.translations.filter((translation) =>
    content.languages.includes(translation.language),
  );
  if (chosen.length === 1) {
    text += ` — ${chosen[0].text.trim()}`;
  } else if (chosen.length > 1) {
    text += ` — ${chosen
      .map(
        (translation) =>
          `${languageTagLabel(translation.language)} ${translation.text.trim()}`,
      )
      .join(" · ")}`;
  }
  return text;
}

// One renderer for both views, which is what makes "a Translations column
// in list and table" true rather than approximately true (Question 327):
// the row and the cell show the same thing in the same shape, with no
// second copy to drift out of step.
//
// Tagged rather than labelled — "fr confusion" instead of "French:
// confusion" — because this has to survive being one column among fifteen
// in the table. The full name is on the tooltip, which is where the longer
// answer belongs when the short one is nearly always enough.
function TranslationTags({
  translations,
}: {
  translations: VocabularyEntryData["translations"];
}) {
  if (translations.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      {translations.map((translation) => (
        <span key={translation.id} title={translation.language}>
          <span className="mr-1 rounded bg-zinc-800 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {languageTag(translation.language)}
          </span>
          {translation.text}
        </span>
      ))}
    </span>
  );
}

// One <dl> of generated fields, used for the word itself and for each of
// its translations (Question 335). Extracted rather than written twice
// because they are the same fields — a French word's synonyms should look
// exactly like a German word's, since that is what they are.
function DetailFields({
  items,
}: {
  items: { field: string; label: string; value: string }[];
}) {
  return (
    <>
      {items.map(({ field, label, value }) => {
        // Multi-value fields are stored one per line, so anything with line
        // breaks renders as a list rather than a wall of text. Single-line
        // values (level, part of speech, and the comma-separated ones) stay
        // as they are.
        const lines = value
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
      })}
    </>
  );
}

// Which fields a word answers once per language, as a set for looking up
// (Question 347). The list itself lives in lib/vocabulary-enrichment.ts —
// this is only the membership test the table needs.
const PER_LANGUAGE_FIELD_SET = new Set<string>(PER_LANGUAGE_FIELDS);

// The word and its translations as one list of "this word, in this
// language" — the shape the table needs now that a field can be answered
// once per language (Question 347).
//
// The narrowing applies to the word's own form too, not only to its
// translations, and that's deliberate rather than careless. Narrow to
// French and ask for B1, and you should get words that are B1 *in French* —
// not words that are B1 in whatever language they happen to be saved
// under, which is exactly the loose match Answer 345 flagged and this is
// here to close.
//
// Empty values are dropped, so a form contributes nothing until it has
// something to say. That keeps "which words have no synonyms yet" honest
// once synonyms can exist in one language and not another.
function fieldForms(
  entry: VocabularyEntryData,
  field: PerLanguageField,
  shown: Set<string>,
): { language: string; value: string }[] {
  const forms = [
    { language: entry.language, value: entry[field] ?? "" },
    ...entry.translations.map((translation) => ({
      language: translation.language,
      value: translation[field] ?? "",
    })),
  ];
  return forms.filter(
    (form) =>
      form.value.trim() && (shown.size === 0 || shown.has(form.language)),
  );
}

// One field's answers, tagged by language.
//
// Bare when there's only one and tagged when there are several — the same
// rule Inline Translate's passage follows, for the same reason: a label
// beside a single answer names something nothing else is competing with.
//
// Question 347 showed the sentence fields as tags alone, on the grounds
// that four languages of examples would make a row taller than the screen.
// Question 348 overruled it, and rightly: the Columns control already
// exists so you can hide a column you find too heavy, and deciding a
// column was too heavy on your behalf was answering a question you already
// had a control for.
//
// So every field shows its text. `multiline` only changes the shape —
// one-per-line values keep the bullet list the table has always given
// them, and several languages of those stack rather than run together.
function LanguageValues({
  forms,
  multiline = false,
}: {
  forms: { language: string; value: string }[];
  multiline?: boolean;
}) {
  if (forms.length === 0) return null;

  const renderValue = (value: string) => {
    const lines = value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (multiline && lines.length > 1) {
      return (
        <ul className="list-disc space-y-0.5 pl-4">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      );
    }
    return lines[0] ?? "";
  };

  // One language reads exactly as this column always has, bullet list and
  // all — nobody working in a single language should see a change.
  if (forms.length === 1) return <>{renderValue(forms[0].value)}</>;

  const tag = (language: string) => (
    <span
      title={language}
      className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
    >
      {languageTag(language)}
    </span>
  );

  // Sentences get a block each, with the tag above them: a bullet list
  // can't sit inline beside a tag, and three languages of them running
  // together would be unreadable even where there's room for it.
  if (multiline) {
    return (
      <div className="space-y-1.5">
        {forms.map((form) => (
          <div key={form.language}>
            {tag(form.language)}
            <div className="mt-0.5">{renderValue(form.value)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      {forms.map((form) => (
        <span key={form.language}>
          <span className="mr-1">{tag(form.language)}</span>
          {form.value}
        </span>
      ))}
    </span>
  );
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
  defaultTranslateLanguage,
}: {
  entries: VocabularyEntryData[];
  defaultTranslateLanguage: string;
}) {
  const router = useRouter();
  const [words, setWords] = useState("");
  const [language, setLanguage] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSummary, setAddSummary] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // A set rather than a single value, and empty means "every language"
  // rather than "no language" — the same shape the Table's column filters
  // use, so the two read alike even though they answer to different parts
  // of the page. It stays shared state, not Table-only state: List has its
  // own control for it on screen, so nothing is hidden there for a reason
  // that view can't explain (Question 255).
  const [languageFilters, setLanguageFilters] = useState<Set<string>>(
    () => new Set(),
  );
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const [enrichmentFilter, setEnrichmentFilter] =
    useState<EnrichmentFilter>("all");
  // List stays the default: it's the everyday view, and Table only earns
  // its place when you want to compare several words' information at once
  // (Answer 241). A view preference, so nothing about it is persisted.
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  // Whether the table is allowed the whole window rather than the column
  // the rest of the page reads in (Question 344).
  //
  // Not persisted, and that's a deliberate match rather than an oversight:
  // it's a sub-preference of viewMode directly above, which isn't
  // persisted either. The column *layout* is remembered because it's a
  // standing decision about which columns you care about; this is closer
  // to "give me room for a minute", and fullscreen — its other half —
  // can't be restored on load anyway, since browsers only grant it in
  // response to a click.
  const [wideTable, setWideTable] = useState(false);
  // Which languages the table's per-language columns show and match on
  // (Question 347). Empty means all of them, the same convention the
  // Languages filter above uses for "no filter" rather than "nothing".
  //
  // Not persisted, matching Wide and Fullscreen beside it: this is
  // "I'm working on French this week", not a standing decision about the
  // table's shape the way the column layout is.
  const [shownLanguages, setShownLanguages] = useState<string[]>([]);
  const [shownLanguagesOpen, setShownLanguagesOpen] = useState(false);
  const [shownLanguageDraft, setShownLanguageDraft] = useState("");
  const shownLanguagesRef = useRef<HTMLDivElement>(null);
  // Fullscreen is the browser's, not ours, so it can be left by pressing
  // Escape without anything here being clicked. Listening for the change
  // rather than trusting our own button is what keeps the label honest.
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const tableSectionRef = useRef<HTMLDivElement>(null);
  // Per-column value filters, Table view only. An empty set means "no
  // filter on this column" rather than "match nothing", so the initial
  // state shows everything.
  // Built from the column table rather than listed by hand, so a column
  // added there is filterable without anything else being remembered.
  const [columnFilters, setColumnFilters] = useState<
    Record<FilterableColumn, Set<string>>
  >(
    () =>
      Object.fromEntries(
        FILTERABLE_COLUMNS.map((column) => [column.field, new Set<string>()]),
      ) as Record<FilterableColumn, Set<string>>,
  );
  // Which question the Translations filter is asking — the ticked
  // languages mean "has one of these" or "is missing one of these"
  // depending on it (Question 327). Its own piece of state rather than a
  // fourth entry in each filter set, because it isn't a value you can tick:
  // it changes what every tick beside it means.
  const [translationsMode, setTranslationsMode] = useState<"has" | "missing">(
    "has",
  );
  // Language joins this same state as a literal alongside the real
  // FilterableColumns, so its header can open through the identical
  // anchored panel — without joining FILTERABLE_COLUMNS itself, which
  // would mean joining columnFilters too, and columnFilters is Table-only
  // state (Question 255). Language stays shared; only the header's click
  // affordance is being reused here, not the state underneath it.
  const [openFilter, setOpenFilter] = useState<
    FilterableColumn | "language" | null
  >(null);
  // Read through useSyncExternalStore rather than useState, for the same
  // reason the speech hook does: the value lives outside React, and the
  // server needs its own answer for it — there's no localStorage there, so
  // it renders the default order and the stored one takes over on the
  // client. A useState initializer would disagree with the server's markup;
  // an effect would be setState inside an effect, which the lint rules
  // reject and which would flash the wrong order anyway.
  const columnLayout = useSyncExternalStore(
    subscribeToColumnLayout,
    readColumnLayout,
    readDefaultColumnLayout,
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  // Fixed coordinates rather than an absolutely-positioned child: the table
  // sits in an `overflow-x-auto` wrapper, and a container that clips one
  // axis clips the other too, so a panel hanging below the header would be
  // cut off. Same reason LanguageCombobox positions its dropdown this way.
  const [filterAnchor, setFilterAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  // Wraps the button as well as the panel, so clicking the button counts as
  // inside: otherwise mousedown would close the panel a moment before the
  // click reopened it, and the button would never close what it opened.
  const languagePanelRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Only one row editable at a time — same one-card-at-a-time principle
  // Vocab Shuffle's own edit uses, just applied to a list of rows instead
  // of a single card.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editLanguage, setEditLanguage] = useState("");
  // The word's translations while the row is open for editing. Held as a
  // list rather than written straight through, so Cancel means Cancel for
  // these exactly as it does for every other field beside them.
  const [editTranslations, setEditTranslations] = useState<
    {
      language: string;
      text: string;
      enrichment: Record<PerLanguageField, string>;
    }[]
  >([]);
  // Which translation has its fields open in the edit form. One at a time,
  // and closed to begin with: seven fields times three languages is a form
  // nobody can see the Save button on, and the common edit is still the
  // translation text itself (Question 335).
  const [openTranslationFields, setOpenTranslationFields] = useState<
    string | null
  >(null);
  // The half-filled new one, kept apart from the list above for the same
  // reason the enrich modal keeps its language draft apart: a language
  // typed but not yet added isn't a translation, and a blank row saved by
  // accident is a row you then have to go and delete.
  const [newTranslationLanguage, setNewTranslationLanguage] = useState("");
  const [newTranslationText, setNewTranslationText] = useState("");
  // All generated fields in one object rather than a useState per field —
  // seven separate ones would be pure noise, and this keeps adding a field
  // to ENRICHMENT_FIELDS enough on its own.
  const [editEnrichment, setEditEnrichment] =
    useState<Record<EnrichmentKey, string>>(emptyEnrichment);
  // Which sentence is being checked, not merely whether one is — the word
  // has its own and so does every translation now (Question 338), and a
  // single boolean would put "Checking…" on all of them at once. The value
  // is the entry's language for its own sentence, or the translation's.
  const [fixingSentence, setFixingSentence] = useState<string | null>(null);
  const [fixSentenceError, setFixSentenceError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Selection for enrichment, by entry id — same Set-of-ids shape Inline
  // Translate's word marking uses, for the same reason: selecting one
  // occurrence must not select anything else that merely looks like it.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [enrichModalOpen, setEnrichModalOpen] = useState(false);
  const [shuffleModalOpen, setShuffleModalOpen] = useState(false);
  const [sendingToShuffle, setSendingToShuffle] = useState(false);
  const [shuffleError, setShuffleError] = useState<string | null>(null);
  const [shuffleSummary, setShuffleSummary] = useState<string | null>(null);
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

  // Renamed from openColumnFilter now that it also opens Language's panel:
  // the anchoring and toggle-closed logic don't care what they're opening,
  // which is exactly what let Language join this without its own copy.
  function openHeaderFilter(
    field: FilterableColumn | "language",
    anchor: HTMLElement,
  ) {
    if (openFilter === field) {
      setOpenFilter(null);
      return;
    }
    const bounds = anchor.getBoundingClientRect();
    setFilterAnchor({ left: bounds.left, top: bounds.bottom + 4 });
    setOpenFilter(field);
  }

  function addShownLanguage() {
    const language = shownLanguageDraft.trim();
    if (!language) return;
    setShownLanguages((prev) =>
      prev.some((existing) => existing.toLowerCase() === language.toLowerCase())
        ? prev
        : [...prev, language],
    );
    setShownLanguageDraft("");
  }

  function toggleLanguageFilter(value: string) {
    setLanguageFilters((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
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

  // One renderer for every filterable header, so Translation and the
  // generated columns can't drift into looking or behaving differently —
  // they're the same control over the same state, and the only thing that
  // varies between them is what's inside the panel it opens.
  //
  // Language is handled here too, ahead of the FilterableColumn lookup,
  // for the same reason: this button should be indistinguishable from the
  // others by look or behaviour (Question 325). It reads and writes
  // languageFilters instead of columnFilters, because that state has to
  // stay shared with List (Question 324) — the button is the only part
  // that's borrowed, not the data underneath it.
  function renderColumnHeader(field: string, label: string) {
    if (field === "language") {
      const active = languageFilters.size > 0;
      return (
        <button
          onClick={(event) => openHeaderFilter("language", event.currentTarget)}
          title="Filter by language"
          className={`flex items-center gap-1 transition-colors hover:text-indigo-300 ${
            active ? "text-indigo-300" : ""
          }`}
        >
          {label}
          <span className="text-[10px]">{active ? "▼" : "▾"}</span>
        </button>
      );
    }
    const column = FILTER_BY_FIELD.get(field as FilterableColumn);
    if (!column) return label;
    const active = effectiveFilter(column.field).size > 0;
    return (
      <button
        onClick={(event) => openHeaderFilter(column.field, event.currentTarget)}
        title={
          column.kind === "presence"
            ? `Show only words that have ${label.toLowerCase()}, or only those that don't`
            : `Filter by ${label.toLowerCase()}`
        }
        className={`flex items-center gap-1 transition-colors hover:text-indigo-300 ${
          active ? "text-indigo-300" : ""
        }`}
      >
        {label}
        <span className="text-[10px]">{active ? "▼" : "▾"}</span>
      </button>
    );
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

  // Your own sentence, checked by the same action Writing Check, the chat
  // and Speak Check all use — pointed at one sentence instead of a passage
  // (Question 310). The corrected text replaces what's in the box, but only
  // in the box: nothing is saved until you save the word, so a correction
  // you disagree with costs you a Cancel, not an undo.
  // `translationIndex` picks which sentence is being checked: leave it out
  // for the word's own, give it for one of its translations. One function
  // rather than two, because the only thing that differs between them is
  // where the sentence comes from and where the correction goes back —
  // and checkWriting is told the right language either way, which is the
  // entire point of the field being per-language (Question 338).
  async function handleFixOwnSentence(
    language: string,
    translationIndex?: number,
  ) {
    const sentence = (
      translationIndex === undefined
        ? editEnrichment.ownExample
        : (editTranslations[translationIndex]?.enrichment.ownExample ?? "")
    ).trim();
    if (!sentence) return;

    setFixingSentence(language);
    setFixSentenceError(null);
    try {
      const result = await checkWriting(sentence, language);
      if (!result.ok) {
        setFixSentenceError(result.error);
        return;
      }
      // Nothing to say when it was already right — silently replacing the
      // sentence with an identical one looks like the button did nothing.
      if (result.data.correctedText.trim() === sentence) {
        setFixSentenceError("That already looks right.");
        return;
      }
      if (translationIndex === undefined) {
        updateEditField("ownExample", result.data.correctedText);
      } else {
        updateEditTranslationField(
          translationIndex,
          "ownExample",
          result.data.correctedText,
        );
      }
    } catch (err) {
      setFixSentenceError(
        describeClientError(err, "Couldn't check that sentence."),
      );
    } finally {
      setFixingSentence(null);
    }
  }

  // Cards carry the word alone, not the word and its translation together.
  // A shuffle review exists to test recall, and a card that shows you the
  // answer alongside the question tests nothing — and the translation isn't
  // lost, it stays on the word in Vocabulary. When a word won't come back
  // to you, clicking it in the review looks it up, now in whichever
  // language you set as your default (Question 305).
  async function handleSendToShuffle(
    destination:
      | { kind: "new"; title: string }
      | { kind: "existing"; listId: string },
    content: CardContent,
  ) {
    const selected = entries.filter((entry) => selectedIds.has(entry.id));
    if (selected.length === 0) return;
    // One per line is what both shuffle actions parse, and it's the same
    // convention this page's own bulk word box already uses.
    const items = selected
      .map((entry) => buildCardText(entry, content))
      .join("\n");

    setSendingToShuffle(true);
    setShuffleError(null);
    try {
      if (destination.kind === "new") {
        const list = await createShuffleListWithCards(
          ShuffleListType.word,
          destination.title,
          items,
        );
        setShuffleSummary(
          `Sent ${selected.length} word${selected.length !== 1 ? "s" : ""} to a new list, "${list.title}".`,
        );
      } else {
        const { createdCount } = await appendCardsToShuffleList(
          destination.listId,
          items,
        );
        setShuffleSummary(
          `Added ${createdCount} word${createdCount !== 1 ? "s" : ""} to that list.`,
        );
      }
      setShuffleModalOpen(false);
      setSelectedIds(new Set());
    } catch (err) {
      setShuffleError(
        describeClientError(err, "Couldn't send those words — try again."),
      );
    } finally {
      setSendingToShuffle(false);
    }
  }

  async function handleEnrich(
    fields: EnrichableField[],
    translateInto: string[],
    scope: EnrichmentScope,
  ) {
    setEnriching(true);
    setEnrichError(null);
    try {
      const result = await enrichVocabularyEntries(Array.from(selectedIds), {
        fields,
        translateInto,
        scope,
      });
      if (!result.ok) {
        setEnrichError(result.error);
        return;
      }
      const { updated, requested } = result.data;
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
        describeClientError(err, "Couldn't generate that information — try again."),
      );
    } finally {
      setEnriching(false);
    }
  }

  function handleStartEdit(entry: VocabularyEntryData) {
    setEditingId(entry.id);
    setEditWord(entry.word);
    setEditLanguage(entry.language);
    setEditEnrichment(
      Object.fromEntries(
        ENRICHMENT_FIELDS.map(({ field }) => [field, entry[field] ?? ""]),
      ) as Record<EnrichmentKey, string>,
    );
    setEditTranslations(
      entry.translations.map((translation) => ({
        language: translation.language,
        text: translation.text,
        enrichment: Object.fromEntries(
          TRANSLATION_FIELDS.map(({ field }) => [
            field,
            translation[field] ?? "",
          ]),
        ) as Record<PerLanguageField, string>,
      })),
    );
    setOpenTranslationFields(null);
    setNewTranslationLanguage("");
    setNewTranslationText("");
    setEditError(null);
  }

  function updateEditTranslation(index: number, text: string) {
    setEditTranslations((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, text } : item,
      ),
    );
  }

  function updateEditTranslationField(
    index: number,
    field: PerLanguageField,
    value: string,
  ) {
    setEditTranslations((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, enrichment: { ...item.enrichment, [field]: value } }
          : item,
      ),
    );
  }

  function removeEditTranslation(index: number) {
    setEditTranslations((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  // Adding replaces rather than duplicates when the language is already
  // there, because the database's own rule is one row per language — a
  // second French added by hand isn't a second translation, it's a
  // correction of the first, and silently colliding at save time would be
  // a worse way to find that out.
  function addEditTranslation() {
    const language = newTranslationLanguage.trim();
    const text = newTranslationText.trim();
    if (!language || !text) return;
    setEditTranslations((prev) => {
      const existing = prev.findIndex(
        (item) => item.language.toLowerCase() === language.toLowerCase(),
      );
      if (existing === -1) {
        return [
          ...prev,
          {
            language,
            text,
            enrichment: Object.fromEntries(
              TRANSLATION_FIELDS.map(({ field }) => [field, ""]),
            ) as Record<PerLanguageField, string>,
          },
        ];
      }
      // Only the text is replaced — retyping a language you already have is
      // correcting its translation, not asking for its level and synonyms
      // to be thrown away.
      return prev.map((item, index) =>
        index === existing ? { ...item, text } : item,
      );
    });
    setNewTranslationLanguage("");
    setNewTranslationText("");
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
        language: editLanguage,
        enrichment: editEnrichment,
        // Whatever is still half-typed in the "add one" row is included
        // rather than discarded: filling both boxes and pressing Save
        // without pressing Add first is an obvious thing to do, and losing
        // the translation for it would be the form punishing you for the
        // order you did things in.
        translations: [
          ...editTranslations,
          {
            language: newTranslationLanguage,
            text: newTranslationText,
            enrichment: {},
          },
        ],
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

  // Same treatment for the language panel, minus the scroll handling: this
  // one is positioned against its own button rather than at fixed page
  // coordinates, so it travels with the toolbar instead of detaching.
  useEffect(() => {
    if (!languagesOpen) return;

    function close(event: Event) {
      const target = event.target as Node;
      if (languagePanelRef.current?.contains(target)) return;
      setLanguagesOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLanguagesOpen(false);
    }

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [languagesOpen]);

  useEffect(() => {
    if (!shownLanguagesOpen) return;

    function close(event: Event) {
      const target = event.target as Node;
      if (shownLanguagesRef.current?.contains(target)) return;
      setShownLanguagesOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShownLanguagesOpen(false);
    }

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [shownLanguagesOpen]);

  useEffect(() => {
    function handleFullscreenChange() {
      setTableFullscreen(
        document.fullscreenElement === tableSectionRef.current,
      );
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // The same request/exit pair the notes page already uses — this is that
  // pattern pointed at the table's own section rather than a second way of
  // doing it.
  function toggleTableFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void tableSectionRef.current?.requestFullscreen();
    }
  }

  // Counted the way addVocabularyEntries counts: one entry per non-empty
  // line, deduplicated, so the number shown is the number the limit is
  // actually applied to rather than a rough line count.
  const pastedWordCount = new Set(
    words
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  ).size;

  // Sorted, de-duplicated straight from what's actually saved — no separate
  // list to keep in sync, and it only ever offers languages you actually
  // have words in.
  const availableLanguages = Array.from(
    new Set(entries.map((entry) => entry.language)),
  ).sort((a, b) => a.localeCompare(b));

  // Derived from the available list rather than from the set itself, so the
  // button and the empty state name languages in the order they're listed —
  // and so a language whose last word was just deleted stops being counted
  // instead of silently filtering against an option no longer on offer.
  const chosenLanguages = availableLanguages.filter((lang) =>
    languageFilters.has(lang),
  );
  // The button says what it's filtering to while it's closed — one or two
  // names outright, a count past that, since three or more names would
  // stretch the toolbar and wrap it.
  const languageFilterLabel =
    chosenLanguages.length === 0
      ? "All languages"
      : chosenLanguages.length <= 2
        ? chosenLanguages.join(", ")
        : `${chosenLanguages.length} languages`;

  // Language is an exact match ticked in its own panel, not part of the free
  // -text search — searching "En" as text used to also match any word
  // containing those two letters ("entertain," "listen"), which stopped
  // being usable once the list grew. Text search now only looks at the
  // word and its translation.
  const tooManyToEnrich = selectedIds.size > MAX_ENRICH_WORDS;

  // Offered as the new list's name when every selected word is in the same
  // language, which is the overwhelmingly common case.
  const selectedLanguages = new Set(
    entries
      .filter((entry) => selectedIds.has(entry.id))
      .map((entry) => entry.language),
  );
  const suggestedListTitle =
    selectedLanguages.size === 1 ? Array.from(selectedLanguages)[0] : "";

  // Which translation languages the send-to-shuffle modal can offer, and
  // which one it should tick first (Questions 330 and 333).
  //
  // Counted rather than merely collected, because the fallback needs the
  // counts: your account default wins when the selected words actually
  // have it, and the most common language among them wins when they don't.
  // Preselecting a language none of these words carries would produce
  // cards with a silently missing half.
  const shuffleLanguageCounts = new Map<string, number>();
  for (const entry of entries) {
    if (!selectedIds.has(entry.id)) continue;
    for (const translation of entry.translations) {
      shuffleLanguageCounts.set(
        translation.language,
        (shuffleLanguageCounts.get(translation.language) ?? 0) + 1,
      );
    }
  }
  const shuffleLanguages = Array.from(shuffleLanguageCounts.keys()).sort(
    (a, b) => a.localeCompare(b),
  );
  const suggestedShuffleLanguage =
    defaultTranslateLanguage && shuffleLanguageCounts.has(defaultTranslateLanguage)
      ? defaultTranslateLanguage
      : (Array.from(shuffleLanguageCounts.entries()).sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        )[0]?.[0] ?? "");

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleEntries = entries
    .filter(
      (entry) =>
        // Guarded on the derived list, not the raw set: if the last word
        // in a ticked language is deleted, that tick would otherwise keep
        // filtering while the button had already stopped mentioning it.
        (chosenLanguages.length === 0 ||
          languageFilters.has(entry.language)) &&
        (enrichmentFilter === "all" ||
          (enrichmentFilter === "enriched"
            ? hasEnrichment(entry)
            : !hasEnrichment(entry))) &&
        // Searches every translation rather than the single one it used
        // to, which keeps this working the way it always felt like it did
        // — typing a word in your own language finds the word it belongs
        // to, whichever language you happened to save that in.
        (!normalizedSearch ||
          entry.word.toLowerCase().includes(normalizedSearch) ||
          entry.translations.some((translation) =>
            translation.text.toLowerCase().includes(normalizedSearch),
          )),
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
  // Every language anything in view is written in — the words' own
  // languages and the languages they're translated into, together. Built
  // from what's actually there, the same way every other option list on
  // this page is, so it can't offer a language you have nothing in.
  const formLanguages = Array.from(
    new Set(
      visibleEntries.flatMap((entry) => [
        entry.language,
        ...entry.translations.map((translation) => translation.language),
      ]),
    ),
  ).sort((a, b) => a.localeCompare(b));

  // Kept honest against that list rather than trusted as typed: a language
  // whose last word was deleted stops narrowing anything, instead of
  // silently hiding every row.
  const activeShownLanguages = formLanguages.filter((language) =>
    shownLanguages.includes(language),
  );
  const shownLanguageSet = new Set(activeShownLanguages);
  const shownLanguagesLabel =
    activeShownLanguages.length === 0
      ? "all languages"
      : activeShownLanguages.length <= 2
        ? activeShownLanguages.join(", ")
        : `${activeShownLanguages.length} languages`;

  // Which ticks actually count, once the narrower has had its say.
  //
  // A language ticked here and then hidden by the narrower stops counting
  // (Question 348) — left alone it would be worse than useless in
  // "missing" mode, where every word is missing a language that has been
  // hidden from view. Intersected rather than deleted, the same way the
  // toolbar's own language filter treats a language whose last word was
  // removed: put the language back and your tick is still there.
  //
  // Pulled out of the row filter in Question 349 because the row filter
  // wasn't the only place that needed it. The chips above the table were
  // reading the raw ticks, so a filter that had stopped counting still
  // announced itself — "Has: German" sitting beside "Showing 14 of 14",
  // claiming to filter while filtering nothing. One answer, read by
  // everything that asks.
  function effectiveFilter(field: FilterableColumn): Set<string> {
    const chosen = columnFilters[field];
    const column = FILTER_BY_FIELD.get(field);
    if (!column || column.kind !== "languages" || shownLanguageSet.size === 0) {
      return chosen;
    }
    return new Set(
      Array.from(chosen).filter((language) => shownLanguageSet.has(language)),
    );
  }

  const tableEntries = visibleEntries.filter((entry) => {
    // Narrowing hides words with nothing in the languages you're showing
    // (Question 349). Without this, narrowing to Italian still listed every
    // word that has no Italian at all, as a row of empty cells — which is
    // noise in the one view you opened to look at Italian.
    //
    // Question 349 carved out an exception for "missing", on the grounds
    // that the mode would otherwise be unusable while narrowed. Question
    // 350 took it back out, and was right to: the exception let a filter
    // reach past the narrower and drag back the very rows it had just
    // removed. The rules compose properly without it — the narrower says
    // which words are on the table, the filters ask questions of those,
    // and "which of the words that have Italian are missing Italian" has
    // an honest answer of none. An empty table saying so is a better
    // answer than a contradictory list.
    //
    // Nothing is lost: to ask what's missing in a language, don't narrow
    // to it. The control that hid it is one click from showing it again.
    if (shownLanguageSet.size > 0) {
      const hasSomethingShown =
        shownLanguageSet.has(entry.language) ||
        entry.translations.some((translation) =>
          shownLanguageSet.has(translation.language),
        );
      if (!hasSomethingShown) return false;
    }

    return FILTERABLE_COLUMNS.every((column) => {
      const chosen = effectiveFilter(column.field);
      if (chosen.size === 0) return true;

      const values = columnValues(entry, column, shownLanguageSet);

      // The languages column is the only one that can be asked a negative
      // question, and "missing any of these" is the useful reading of
      // several ticks rather than "missing all of them": ticking French and
      // Italian is asking what still needs work, and a word that has French
      // but not Italian is still work (Question 327).
      //
      // A word is never missing its own language (Question 350). "Which
      // words still need German" should not answer with your German words:
      // they are already German, and nobody translates a word into the
      // language it is written in. This was wrong before any narrowing
      // existed — narrowing only made it visible, by leaving a word's own
      // language as the only one left to ask about.
      if (column.kind === "languages" && translationsMode === "missing") {
        return Array.from(chosen).some(
          (language) =>
            language !== entry.language && !values.includes(language),
        );
      }

      // `some`, not equality: a word shows up under a topic it carries,
      // whether or not it also carries another one.
      return values.some((value) => chosen.has(value));
    });
  });

  // Options come from `visibleEntries` — what the shared filters allow —
  // not from `tableEntries`, so checking a value doesn't make the other
  // options in that same menu disappear underneath you.
  function columnOptions(column: (typeof FILTERABLE_COLUMNS)[number]) {
    // A presence column always offers both answers, even when every word
    // currently happens to fall on one side. "Missing: none" is a useful
    // thing to be told; an option that quietly isn't there just looks like
    // the filter is broken.
    if (column.kind === "presence") return [HAS_VALUE, NO_VALUE];
    // The languages on offer are the ones your words are actually
    // translated into — including in "missing" mode, where that reads
    // slightly oddly at first and is still right: a language nothing has
    // been translated into yet isn't a gap you're tracking, it's a language
    // you haven't started. The moment one word has it, it becomes a fair
    // question to ask of all the others.
    return Array.from(
      new Set(
        visibleEntries.flatMap((entry) =>
          columnValues(entry, column, shownLanguageSet),
        ),
      ),
    ).sort((a, b) =>
      a === NO_VALUE ? 1 : b === NO_VALUE ? -1 : a.localeCompare(b),
    );
  }

  const visibleColumns = columnLayout.filter((column) => column.visible);
  const hiddenColumnCount = columnLayout.length - visibleColumns.length;

  // Renders one cell's worth of a word, whichever column it belongs to.
  // Kept in one place so the header order and the body order can't drift:
  // both walk the same list.
  function renderCell(entry: VocabularyEntryData, key: ConfigurableColumn) {
    if (key === "translations") {
      return (
        <td
          key={key}
          className="border border-zinc-800 px-3 py-2 align-top text-zinc-300"
        >
          {/* Narrowed here and nowhere else: the narrower is a Table-view
              control, so the list row below still shows every translation
              a word has. */}
          <TranslationTags
            translations={entry.translations.filter(
              (translation) =>
                shownLanguageSet.size === 0 ||
                shownLanguageSet.has(translation.language),
            )}
          />
        </td>
      );
    }
    if (key === "language") {
      return (
        <td
          key={key}
          className="whitespace-nowrap border border-zinc-800 px-3 py-2 align-top text-zinc-500"
        >
          {entry.language}
        </td>
      );
    }
    if (key === "added") {
      return (
        <td
          key={key}
          className="whitespace-nowrap border border-zinc-800 px-3 py-2 align-top text-xs text-zinc-600"
        >
          {formatDate(entry.firstSeen)}
        </td>
      );
    }
    // A word with nothing generated yet simply leaves empty cells, rather
    // than being excluded or given placeholder text — the gaps are the
    // point of this view, since they show at a glance what's missing.
    const field = key as EnrichmentKey;
    const multiline = ENRICHMENT_FIELDS.find(
      (item) => item.field === field,
    )?.multiline;

    // Every language's answer, not just the word's own (Question 347). The
    // cell shows exactly the forms the filter counts, which is what keeps
    // the two honest with each other: a word can't appear under a value it
    // gives no visible sign of having.
    if (PER_LANGUAGE_FIELD_SET.has(field)) {
      return (
        <td
          key={key}
          className="border border-zinc-800 px-3 py-2 align-top text-zinc-300"
        >
          <LanguageValues
            forms={fieldForms(entry, field as PerLanguageField, shownLanguageSet)}
            multiline={multiline}
          />
        </td>
      );
    }

    const lines = (entry[field]?.trim() ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return (
      <td
        key={key}
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
  }

  // "language" isn't a key FILTER_BY_FIELD knows — it's rendered from
  // availableLanguages/languageFilters directly, in the panel below.
  const openColumn =
    openFilter && openFilter !== "language"
      ? FILTER_BY_FIELD.get(openFilter)
      : undefined;

  const activeColumnFilters = FILTERABLE_COLUMNS.filter(
    (column) => effectiveFilter(column.field).size > 0,
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* The page reads in a narrow column by default, which is right for
          the list and wrong for a fifteen-column table (Question 344).
          Widening the wrapper rather than letting the table break out of it
          keeps one layout rule instead of two fighting each other — the
          Add-words box and the toolbar simply get more room too, which
          costs nothing in a mode you switched on deliberately. */}
      <div
        className={`mx-auto px-6 py-10 ${
          viewMode === "table" && wideTable ? "max-w-none" : "max-w-3xl"
        }`}
      >
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
          {/* Counted in words, not characters, so `maxLength` can't express
              it — the count is shown and Add is disabled past the limit
              instead, which is the closest equivalent to an uncrossable
              ceiling for a line-based field. */}
          {pastedWordCount >= VOCABULARY_MAX_WORDS * 0.75 && (
            <p
              className={`mt-1 text-right text-xs ${
                pastedWordCount > VOCABULARY_MAX_WORDS
                  ? "text-amber-400"
                  : "text-zinc-500"
              }`}
            >
              {pastedWordCount} / {VOCABULARY_MAX_WORDS} words
              {pastedWordCount > VOCABULARY_MAX_WORDS &&
                " — remove some before adding"}
            </p>
          )}
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
              disabled={adding || pastedWordCount > VOCABULARY_MAX_WORDS}
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

        {/* The fullscreen target is this whole card, not the table
            inside it (Question 344). Fullscreening only the table would
            strand the search box, the language filter and the sort control
            outside the screen they belong to — you would gain rows and
            lose the ability to narrow them down, which is the wrong trade
            in the one view built for looking at everything at once.
            It also needs no colours of its own: the card already carries a
            background and padding, where a bare wrapper would have been
            promoted onto the browser's black backdrop with neither. */}
        <div
          ref={tableSectionRef}
          className={`border border-zinc-800 bg-zinc-900 p-6 ${
            tableFullscreen ? "overflow-y-auto" : "rounded-lg"
          }`}
        >
          {/* Sticky so the search box, the filters and the List/Table
              switch stay reachable while you scroll (Question 354) — the
              same treatment, and the same classes, Parallel Listen's own
              controls have had since Question 232. `bg-zinc-900` matches
              the card, so rows scrolling underneath disappear behind it
              rather than showing through a transparent bar.

              Above the table's own frozen header in the stacking order,
              since they can meet on a short window and the outer control
              should win. */}
          <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900 pb-4">
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
              {/* Checkboxes in a panel rather than a native multi-select:
                  that one needs ctrl-click to reach a second value and shows
                  no ticks, which makes it a poor neighbour to the column
                  filters already looking like this. Borrowed look, its own
                  state — this filter belongs to both views, while the column
                  filters belong to Table alone. */}
              <div className="relative" ref={languagePanelRef}>
                <button
                  onClick={() => setLanguagesOpen((prev) => !prev)}
                  aria-expanded={languagesOpen}
                  className={`rounded-lg border bg-zinc-800 px-3 py-1.5 text-sm outline-none transition-colors hover:border-zinc-500 ${
                    chosenLanguages.length > 0
                      ? "border-indigo-700 text-indigo-300"
                      : "border-zinc-700 text-zinc-200"
                  }`}
                >
                  {languageFilterLabel}
                  <span className="ml-1.5 text-zinc-500">▾</span>
                </button>

                {languagesOpen && (
                  <div className="absolute left-0 top-full z-40 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl">
                    <div className="flex items-center justify-between gap-2 px-3 py-1">
                      <span className="text-xs font-semibold text-zinc-500">
                        Languages
                      </span>
                      {chosenLanguages.length > 0 && (
                        <button
                          onClick={() => setLanguageFilters(new Set())}
                          className="text-xs text-zinc-500 transition-colors hover:text-red-400"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {availableLanguages.map((lang) => (
                      <label
                        key={lang}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
                      >
                        <input
                          type="checkbox"
                          checked={languageFilters.has(lang)}
                          onChange={() => toggleLanguageFilter(lang)}
                          className="shrink-0 accent-indigo-600"
                        />
                        <span className="truncate">{lang}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
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
              {/* The cap belongs to *adding information*, not to selecting
                  — it's there because that's one AI call per batch. Sending
                  words to a shuffle list costs nothing, so it shouldn't
                  inherit a limit that exists for a different reason
                  (Question 306). The count is now plain, and the limit is
                  stated on the button it actually applies to. */}
              <span className="text-sm text-zinc-300">
                {selectedIds.size} selected
                {tooManyToEnrich && (
                  <span className="text-zinc-500">
                    {" "}
                    — more than {MAX_ENRICH_WORDS}, so information can&apos;t
                    be added in one go
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
                    setShuffleError(null);
                    setShuffleSummary(null);
                    setShuffleModalOpen(true);
                  }}
                  className="rounded-md bg-zinc-800 px-3 py-1 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-700"
                >
                  Send to Vocab Shuffle…
                </button>
                <button
                  onClick={() => {
                    setEnrichError(null);
                    setEnrichSummary(null);
                    setEnrichModalOpen(true);
                  }}
                  disabled={tooManyToEnrich}
                  title={
                    tooManyToEnrich
                      ? `${MAX_ENRICH_WORDS} words at a time is the maximum for adding information`
                      : undefined
                  }
                  className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add information…
                </button>
              </div>
            </div>
          )}

          {enrichSummary && (
            <p className="mb-4 text-sm text-emerald-400">{enrichSummary}</p>
          )}
          {shuffleSummary && (
            <p className="mb-4 text-sm text-emerald-400">{shuffleSummary}</p>
          )}
          {shuffleError && !shuffleModalOpen && (
            <p className="mb-4 text-sm text-red-400">{shuffleError}</p>
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
              {chosenLanguages.length > 0
                ? ` in ${chosenLanguages.join(" or ")}`
                : ""}
              {enrichmentFilter === "enriched"
                ? " with information added yet."
                : enrichmentFilter === "plain"
                  ? " still waiting for information."
                  : "."}
            </p>
          ) : viewMode === "table" ? (
            <>
              {/* Both behaviours in one control, because they're one piece
                  of state: an ordered list of columns, each shown or not.
                  Splitting them into a "hide" menu and separate arrows in
                  the headers would have been two interfaces onto the same
                  array — and the headers already carry a filter button. */}
              <div className="mb-3 flex flex-wrap items-start gap-2">
                <div>
                <button
                  onClick={() => setColumnsOpen((prev) => !prev)}
                  aria-expanded={columnsOpen}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
                >
                  Columns
                  {hiddenColumnCount > 0 && (
                    <span className="text-zinc-500">
                      {" "}
                      · {hiddenColumnCount} hidden
                    </span>
                  )}
                </button>

                {columnsOpen && (
                  <div className="mt-2 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Columns
                      </p>
                      <button
                        onClick={() => writeColumnLayout(DEFAULT_COLUMN_LAYOUT)}
                        className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                      >
                        Reset
                      </button>
                    </div>
                    {/* Said outright, because a vertical list moving things
                        left and right is otherwise a guess. */}
                    <p className="mb-2 text-xs text-zinc-600">
                      Top to bottom is left to right in the table.
                    </p>
                    <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
                      {columnLayout.map((column, index) => (
                        <li
                          key={column.key}
                          className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-zinc-800/60"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-zinc-300">
                            <input
                              type="checkbox"
                              checked={column.visible}
                              onChange={() =>
                                writeColumnLayout(
                                  toggleColumn(columnLayout, column.key),
                                )
                              }
                              className="shrink-0 accent-indigo-600"
                            />
                            <span className="truncate">
                              {COLUMN_LABELS[column.key]}
                            </span>
                          </label>
                          <button
                            onClick={() =>
                              writeColumnLayout(
                                moveColumn(columnLayout, index, -1),
                              )
                            }
                            disabled={index === 0}
                            title="Move left"
                            className="shrink-0 px-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-800"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() =>
                              writeColumnLayout(
                                moveColumn(columnLayout, index, 1),
                              )
                            }
                            disabled={index === columnLayout.length - 1}
                            title="Move right"
                            className="shrink-0 px-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-800"
                          >
                            ▼
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                </div>

                {/* Narrows which languages the per-language columns show
                    and match on (Question 347). Down here with Columns
                    rather than up beside the Languages filter on purpose,
                    because it answers a different question: that one picks
                    which words are rows, this one picks which of each
                    word's languages you're looking at. Sharing a row with
                    Columns — the other "what does this table show" control
                    — says that better than sitting next to a filter it
                    would be mistaken for. */}
                <div className="relative" ref={shownLanguagesRef}>
                  <button
                    onClick={() => setShownLanguagesOpen((prev) => !prev)}
                    aria-expanded={shownLanguagesOpen}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeShownLanguages.length > 0
                        ? "border-indigo-700 bg-indigo-950/60 text-indigo-300"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                    }`}
                  >
                    Showing: {shownLanguagesLabel}
                    <span className="ml-1.5 text-zinc-500">▾</span>
                  </button>

                  {shownLanguagesOpen && (
                    <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          Show values in
                        </p>
                        {activeShownLanguages.length > 0 && (
                          <button
                            onClick={() => setShownLanguages([])}
                            className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                          >
                            All
                          </button>
                        )}
                      </div>
                      {/* Says what it governs, because "languages" on a
                          page that already filters by language is ambiguous
                          until something disambiguates it. */}
                      <p className="mb-2 text-xs text-zinc-600">
                        Every column that answers per language — translations
                        included — shows and filters on only these, and words
                        with nothing in them drop out of the table. Asking
                        which words are <em>missing</em> a language still
                        finds them.
                      </p>

                      {activeShownLanguages.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {activeShownLanguages.map((language) => (
                            <button
                              key={language}
                              onClick={() =>
                                setShownLanguages((prev) =>
                                  prev.filter(
                                    (existing) => existing !== language,
                                  ),
                                )
                              }
                              title={`Stop showing ${language}`}
                              className="flex items-center gap-1 rounded-full border border-indigo-800 bg-indigo-950/60 px-2 py-0.5 text-xs text-indigo-300 transition-colors hover:border-red-500 hover:text-red-400"
                            >
                              {language} ✕
                            </button>
                          ))}
                        </div>
                      )}

                      {formLanguages.length === 0 ? (
                        <p className="text-xs text-zinc-600">
                          No languages to choose from yet.
                        </p>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={shownLanguageDraft}
                            onChange={(event) =>
                              setShownLanguageDraft(event.target.value)
                            }
                            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                          >
                            <option value="">Add a language…</option>
                            {formLanguages
                              .filter(
                                (language) =>
                                  !activeShownLanguages.includes(language),
                              )
                              .map((language) => (
                                <option key={language} value={language}>
                                  {language}
                                </option>
                              ))}
                          </select>
                          <button
                            onClick={addShownLanguage}
                            disabled={!shownLanguageDraft.trim()}
                            className="shrink-0 rounded-md bg-zinc-800 px-3 py-1 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Beside Columns rather than up with the List/Table
                    switch: all three shape the table itself, and the
                    switch above chooses whether there is a table at all. */}
                <button
                  onClick={() => setWideTable((prev) => !prev)}
                  aria-pressed={wideTable}
                  title={
                    wideTable
                      ? "Back to the page's normal width"
                      : "Let the table use the whole window"
                  }
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    wideTable
                      ? "border-indigo-700 bg-indigo-950/60 text-indigo-300"
                      : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                  }`}
                >
                  {wideTable ? "Narrow" : "Wide"}
                </button>

                <button
                  onClick={toggleTableFullscreen}
                  title={
                    tableFullscreen
                      ? "Leave fullscreen (or press Escape)"
                      : "Show the table on its own, filling the screen"
                  }
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
                >
                  {tableFullscreen ? "Exit fullscreen" : "Fullscreen"}
                </button>
              </div>

              {activeColumnFilters.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span>
                    Showing {tableEntries.length} of {visibleEntries.length}
                  </span>
                  {activeColumnFilters.map((column) => (
                    <button
                      key={column.field}
                      onClick={() => clearColumnFilter(column.field)}
                      title={`Clear the ${column.label.toLowerCase()} filter`}
                      className="rounded-full border border-indigo-800 bg-indigo-950/60 px-2 py-0.5 text-indigo-300 transition-colors hover:border-red-500 hover:text-red-400"
                    >
                      {/* A presence filter with both options ticked is the
                          same as no filter, so showing a count there would
                          be noise — it says what it's showing instead. */}
                      {column.kind === "presence" &&
                      effectiveFilter(column.field).size === 1
                        ? `${column.label}: ${optionLabel(
                            column.kind,
                            Array.from(effectiveFilter(column.field))[0],
                          )}`
                        : // A count alone would be a lie by omission here:
                          // "Translations: 2" reads as two translations
                          // rather than as two languages you're missing, so
                          // this chip names the mode and the languages
                          // outright (Question 327).
                          column.kind === "languages"
                          ? `${
                              translationsMode === "missing"
                                ? "Missing"
                                : "Has"
                            }: ${Array.from(effectiveFilter(column.field))
                              .sort((a, b) => a.localeCompare(b))
                              .join(", ")}`
                          : `${column.label}: ${effectiveFilter(column.field).size}`}{" "}
                      ✕
                    </button>
                  ))}
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
                //
                // Bounded and scrolling in both directions since Question
                // 354, rather than only sideways. A sticky header sticks
                // inside its nearest scrolling ancestor, and this wrapper
                // already was one — `overflow-x: auto` quietly makes the
                // vertical axis scrollable too — but with no height limit it
                // never actually scrolled, so a sticky header had nothing to
                // stick against and sat where it already was. Giving it a
                // height is what turns the freezing on.
                //
                // The side effect is worth naming: rows now scroll inside
                // the table rather than scrolling the page, which is what
                // keeps everything above them on screen while you read down
                // a long list.
                <div className="max-h-[65vh] overflow-auto">
                  <table className="min-w-full border-collapse border border-zinc-800 text-sm">
                    <thead>
                      {/* Each header cell carries its own background and its
                          own bottom edge, and both are needed. A sticky cell
                          leaves the row behind, so the row's background
                          can't travel with it — and under `border-collapse`
                          the borders belong to the table rather than the
                          cell, so they'd be left behind too. The inset
                          shadow is that missing bottom border, drawn by the
                          cell itself. */}
                      <tr className="bg-zinc-800">
                        <th className="sticky top-0 z-10 border border-zinc-800 bg-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300 shadow-[inset_0_-1px_0_#27272a]">
                          <span className="sr-only">Select</span>
                        </th>
                        <th className="sticky top-0 z-10 border border-zinc-800 bg-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300 shadow-[inset_0_-1px_0_#27272a]">
                          Word
                        </th>
                        {visibleColumns.map(({ key }) => (
                          <th
                            key={key}
                            className="sticky top-0 z-10 border border-zinc-800 bg-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300 shadow-[inset_0_-1px_0_#27272a]"
                          >
                            {/* Only Added has no header filter — a date
                                isn't a value picked from a list, the same
                                reason the other presence-only columns don't
                                list values either. Language gets the same
                                clickable header as everything else now
                                (Question 325), reading and writing the
                                shared languageFilters state so the toolbar
                                dropdown above stays in sync — it's the same
                                filter, opened two ways. renderColumnHeader
                                falls back to the plain label for anything
                                not filterable at all. */}
                            {renderColumnHeader(key, COLUMN_LABELS[key])}
                          </th>
                        ))}
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
                              title="Select"
                              className="accent-indigo-600"
                            />
                          </td>
                          <td className="whitespace-nowrap border border-zinc-800 px-3 py-2 align-top font-medium text-zinc-100">
                            {entry.word}
                          </td>
                          {visibleColumns.map(({ key }) =>
                            renderCell(entry, key),
                          )}
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
                      <LanguageCombobox
                        value={editLanguage}
                        onChange={setEditLanguage}
                        placeholder="Language"
                        compact
                        className="w-32 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                      />
                    </div>

                    {/* The per-language translations, editable by hand like
                        everything else on a word (Question 327). This was
                        the one real gap 6a left open: information the app
                        could write and you couldn't correct.

                        Each row is language plus text, and the language is
                        fixed once it's there — changing "French" to
                        "Italian" in place isn't an edit, it's a different
                        translation, so it's a remove and an add. */}
                    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Translations
                      </p>
                      {editTranslations.length > 0 && (
                        <div className="mb-2 space-y-1.5">
                          {editTranslations.map((item, index) => {
                            const filled = TRANSLATION_FIELDS.filter(
                              ({ field }) => item.enrichment[field]?.trim(),
                            ).length;
                            const open =
                              openTranslationFields === item.language;
                            return (
                              <div key={item.language}>
                                <div className="flex items-center gap-2">
                                  <span
                                    title={item.language}
                                    className="w-10 shrink-0 rounded bg-zinc-800 px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                                  >
                                    {languageTag(item.language)}
                                  </span>
                                  <input
                                    type="text"
                                    value={item.text}
                                    onChange={(event) =>
                                      updateEditTranslation(
                                        index,
                                        event.target.value,
                                      )
                                    }
                                    placeholder={`Translation in ${item.language}`}
                                    className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                                  />
                                  {/* Collapsed by default, and the count is
                                      why that works: seven fields per
                                      language would bury the Save button,
                                      but you can still see at a glance
                                      whether there is anything under this
                                      one before opening it. */}
                                  <button
                                    onClick={() =>
                                      setOpenTranslationFields((prev) =>
                                        prev === item.language
                                          ? null
                                          : item.language,
                                      )
                                    }
                                    aria-expanded={open}
                                    title={`Level, gender, synonyms and examples for the ${item.language} word`}
                                    className="shrink-0 rounded-md px-1.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-indigo-300"
                                  >
                                    {filled > 0 ? `${filled} fields` : "Fields"}{" "}
                                    {open ? "▴" : "▾"}
                                  </button>
                                  <button
                                    onClick={() => removeEditTranslation(index)}
                                    title={`Remove the ${item.language} translation`}
                                    className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                                  >
                                    ✕
                                  </button>
                                </div>

                                {open && (
                                  <div className="ml-12 mt-1.5 grid gap-2 sm:grid-cols-2">
                                    {TRANSLATION_FIELDS.map(
                                      ({
                                        field,
                                        label,
                                        multiline,
                                        placeholder,
                                      }) => (
                                        <div
                                          key={field}
                                          className={
                                            multiline
                                              ? "sm:col-span-2"
                                              : undefined
                                          }
                                        >
                                          <div className="mb-0.5 flex items-center justify-between gap-2">
                                            <label
                                              htmlFor={`${entry.id}-${item.language}-${field}`}
                                              className="block text-[11px] uppercase tracking-wider text-zinc-600"
                                            >
                                              {label}
                                            </label>
                                            {/* Checked in this form's own
                                                language, which is the
                                                whole reason the sentence
                                                is stored per language:
                                                a French sentence checked
                                                against German would be
                                                corrected into nonsense. */}
                                            {field === "ownExample" &&
                                              item.enrichment.ownExample?.trim() && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleFixOwnSentence(
                                                      item.language,
                                                      index,
                                                    )
                                                  }
                                                  disabled={
                                                    fixingSentence !== null
                                                  }
                                                  title={`Check this sentence against ${item.language} and correct it`}
                                                  className="text-[11px] text-indigo-400 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:text-zinc-600"
                                                >
                                                  {fixingSentence ===
                                                  item.language
                                                    ? "Checking…"
                                                    : "Fix with AI"}
                                                </button>
                                              )}
                                          </div>
                                          {multiline ? (
                                            <textarea
                                              id={`${entry.id}-${item.language}-${field}`}
                                              value={item.enrichment[field]}
                                              onChange={(event) =>
                                                updateEditTranslationField(
                                                  index,
                                                  field,
                                                  event.target.value,
                                                )
                                              }
                                              rows={2}
                                              placeholder={placeholder}
                                              className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                                            />
                                          ) : (
                                            <input
                                              id={`${entry.id}-${item.language}-${field}`}
                                              type="text"
                                              value={item.enrichment[field]}
                                              onChange={(event) =>
                                                updateEditTranslationField(
                                                  index,
                                                  field,
                                                  event.target.value,
                                                )
                                              }
                                              placeholder={placeholder}
                                              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500"
                                            />
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <LanguageCombobox
                          value={newTranslationLanguage}
                          onChange={setNewTranslationLanguage}
                          placeholder="Language"
                          compact
                          wrapperClassName="w-32 shrink-0"
                          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                        />
                        <input
                          type="text"
                          value={newTranslationText}
                          onChange={(event) =>
                            setNewTranslationText(event.target.value)
                          }
                          placeholder="Translation"
                          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                        />
                        <button
                          onClick={addEditTranslation}
                          disabled={
                            !newTranslationLanguage.trim() ||
                            !newTranslationText.trim()
                          }
                          className="shrink-0 rounded-md bg-zinc-800 px-3 py-1 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-zinc-600">
                        Emptying one and saving removes it — the same way
                        every other field here works.
                      </p>
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
                                <div className="flex items-center gap-3">
                                  {field === "ownExample" && value.trim() && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleFixOwnSentence(entry.language)
                                      }
                                      disabled={fixingSentence !== null}
                                      title="Check this sentence and correct it"
                                      className="text-xs text-indigo-400 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:text-zinc-600"
                                    >
                                      {fixingSentence === entry.language
                                        ? "Checking…"
                                        : "Fix with AI"}
                                    </button>
                                  )}
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
                    {/* Amber, not red: "that already looks right" is the
                        most likely thing this ever says, and it isn't a
                        failure. */}
                    {fixSentenceError && (
                      <p className="mt-3 text-sm text-amber-400">
                        {fixSentenceError}
                      </p>
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
                      title="Select"
                      className="mt-1 shrink-0 accent-indigo-600"
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
                      {(populatedEnrichment(entry).length > 0 ||
                        entry.translations.some(
                          (translation) =>
                            populatedTranslationFields(translation).length > 0,
                        )) && (
                        <button
                          onClick={() => toggleExpanded(entry.id)}
                          aria-expanded={expandedIds.has(entry.id)}
                          className="ml-2 text-xs text-zinc-500 transition-colors hover:text-indigo-300"
                        >
                          Details {expandedIds.has(entry.id) ? "▴" : "▾"}
                        </button>
                      )}
                      {/* On its own line rather than inline with the word:
                          three translations run longer than everything
                          before them put together, and threading them into
                          that row would push the level badge and the
                          Details button off the end of it. */}
                      {entry.translations.length > 0 && (
                        <div className="mt-1 text-sm text-zinc-400">
                          <TranslationTags translations={entry.translations} />
                        </div>
                      )}
                      {expandedIds.has(entry.id) &&
                        (() => {
                          // Only the translations that actually carry
                          // generated fields — one that is just text is
                          // already fully shown by the tags above, and a
                          // heading over nothing reads as something missing
                          // rather than as something absent.
                          const enrichedTranslations = entry.translations.filter(
                            (translation) =>
                              populatedTranslationFields(translation).length > 0,
                          );
                          // Headings appear only once there is more than one
                          // language to tell apart. A word enriched in its own
                          // language alone looks exactly as it did before this
                          // step existed.
                          const grouped = enrichedTranslations.length > 0;
                          return (
                            <dl className="mt-2 space-y-2 rounded-lg bg-zinc-950/60 p-3 text-xs">
                              {grouped && (
                                <p className="font-semibold uppercase tracking-wider text-indigo-400/80">
                                  {entry.language}
                                </p>
                              )}
                              <DetailFields
                                items={populatedEnrichment(entry).map(
                                  ({ field, label }) => ({
                                    field,
                                    label,
                                    value: entry[field] ?? "",
                                  }),
                                )}
                              />
                              {enrichedTranslations.map((translation) => (
                                <div
                                  key={translation.id}
                                  className="space-y-2 border-t border-zinc-800 pt-2"
                                >
                                  <p className="font-semibold uppercase tracking-wider text-indigo-400/80">
                                    {translation.language}
                                    <span className="ml-1.5 font-normal normal-case tracking-normal text-zinc-500">
                                      {translation.text}
                                    </span>
                                  </p>
                                  <DetailFields
                                    items={populatedTranslationFields(
                                      translation,
                                    ).map(({ field, label }) => ({
                                      field,
                                      label,
                                      value: translation[field] ?? "",
                                    }))}
                                  />
                                </div>
                              ))}
                            </dl>
                          );
                        })()}
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
              {openFilter === "language"
                ? "Language"
                : FILTER_BY_FIELD.get(openFilter)?.label ?? openFilter}
            </span>
            {/* Same Clear affordance either way, just pointed at whichever
                state this panel currently belongs to. */}
            {(openFilter === "language"
              ? languageFilters.size > 0
              : columnFilters[openFilter].size > 0) && (
              <button
                onClick={() =>
                  openFilter === "language"
                    ? setLanguageFilters(new Set())
                    : clearColumnFilter(openFilter)
                }
                className="text-xs text-zinc-500 transition-colors hover:text-red-400"
              >
                Clear
              </button>
            )}
          </div>

          {/* The switch that decides what every tick below it means. Placed
              above them and worded as a sentence the ticks finish — "Has
              …" / "Missing …" — because a mode control sitting silently
              beside a list of checkboxes is the kind of thing you discover
              by accident three weeks later (Question 327). */}
          {openFilter === "translations" && (
            <div className="mx-3 mb-1 mt-1 flex overflow-hidden rounded-md border border-zinc-700">
              {(["has", "missing"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTranslationsMode(mode)}
                  className={`flex-1 px-2 py-1 text-xs font-medium capitalize transition-colors ${
                    translationsMode === mode
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}

          {openColumn?.kind === "languages" &&
            columnOptions(openColumn).length === 0 && (
              <p className="px-3 py-2 text-xs text-zinc-600">
                {activeShownLanguages.length > 0
                  ? "None in the languages you're showing — widen Showing to see the rest."
                  : "No translations saved yet — add some from “Add information”."}
              </p>
            )}

          {openFilter === "language"
            ? // Same list the toolbar dropdown offers, in the same order —
              // opening this from the header shouldn't show a different set
              // of languages than opening it from above the table would.
              availableLanguages.map((lang) => (
                <label
                  key={lang}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  <input
                    type="checkbox"
                    checked={languageFilters.has(lang)}
                    onChange={() => toggleLanguageFilter(lang)}
                    className="shrink-0 accent-indigo-600"
                  />
                  <span className="truncate">{lang}</span>
                </label>
              ))
            : openColumn &&
              columnOptions(openColumn).map((value) => (
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
                  {/* The "nothing here" bucket is offered like any other
                      option, since "which words still have nothing here" is
                      one of the more useful things to filter for (Question
                      254) — and for a presence column it's one of only two. */}
                  {value === NO_VALUE && openColumn.kind === "values" ? (
                    <span className="italic text-zinc-500">(none)</span>
                  ) : (
                    optionLabel(openColumn.kind, value)
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
          defaultTranslateLanguage={defaultTranslateLanguage}
        />
      )}

      {shuffleModalOpen && (
        <VocabularyToShuffleModal
          wordCount={selectedIds.size}
          running={sendingToShuffle}
          error={shuffleError}
          suggestedTitle={suggestedListTitle}
          availableLanguages={shuffleLanguages}
          suggestedLanguage={suggestedShuffleLanguage}
          onCancel={() => setShuffleModalOpen(false)}
          onConfirm={handleSendToShuffle}
        />
      )}
    </div>
  );
}
