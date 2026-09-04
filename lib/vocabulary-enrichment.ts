// Shared constants and types for vocabulary enrichment.
//
// These deliberately live here rather than in
// app/actions/vocabulary-enrich-actions.ts: a "use server" module may only
// export async functions, and exporting a plain constant from one doesn't
// merely warn — it strips the module of *all* its exports, so even the
// action itself stops being importable. Keeping the shared values in an
// ordinary module lets both the server action and the client UI import
// them from one place.

// Capped deliberately: one batched AI call covers the whole selection, so
// the limit is about keeping that single call's response a sane size (and
// its cost predictable), not about how many rows the database can take.
//
// Raised in Question 273, but more conservatively than the limits in
// lib/limits.ts: this is the single most output-expensive item of
// anything increased so far — each word can ask for up to seven fields at
// once, several of them multi-line lists, not one short value. Vocabulary's
// own word-count limit could be raised generously because it's a plain
// database write with no AI call behind it at all; this one genuinely
// scales the response with every word added, so it stays well short of
// that.
export const MAX_ENRICH_WORDS = 30;

// The fields the user can ask for. Every one is independently selectable —
// only what's checked is ever generated, per Question 242. Ordered as the
// modal lists them.
export const ENRICHABLE_FIELDS = [
    "translation",
    "level",
    "nounInfo",
    "wordFamily",
    "synonyms",
    "aiExamples",
    "collocations",
    "partOfSpeech",
    "usedIn",
    "category",
] as const;

export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

// The generated fields that live in their own columns and are hand-editable
// (Question 250). Deliberately not the same list as ENRICHABLE_FIELDS:
// `translation` is excluded because it predates enrichment and is already
// edited alongside the word and language, so it would otherwise appear
// twice in the same form.
export const ENRICHMENT_DETAIL_FIELDS = [
    "level",
    "nounInfo",
    "partOfSpeech",
    "usedIn",
    "category",
    "wordFamily",
    "synonyms",
    "aiExamples",
    "collocations",
    // Never generated, unlike everything above it — it's yours to write.
    // It lives in this list all the same, because this list is what the
    // page renders and edits, and a sentence you wrote should be editable
    // exactly like every other field on the word (Question 310).
    "ownExample",
] as const;

export type EnrichmentDetailField = (typeof ENRICHMENT_DETAIL_FIELDS)[number];

export interface EnrichOptions {
    fields: EnrichableField[];
    // Only read when "translation" is among the fields — which language to
    // translate into. The entry itself doesn't record a language for its
    // translation (Question 214), so this is per-batch, not per-word.
    translateInto?: string;
}


// Defends against a real, verified corruption pattern (Question 248): a
// typographic character like an en dash can arrive from the model with its
// leading UTF-8 byte lost somewhere upstream of this app's own code (a
// direct database round-trip test ruled out Prisma/pg/Postgres as the
// cause), leaving orphaned continuation-byte codepoints in the U+0080-
// U+009F range — invisible C1 control characters that render as tofu
// boxes, not a missing font glyph. No field this app generates has any
// legitimate use for a raw control character, so stripping them is always
// safe. Also normalizes to NFC and swaps a few typographic characters the
// model tends to prefer for the plain ASCII ones actually asked for in the
// prompt (en/em dash to hyphen, curly quotes to straight) — reinforcing
// that instruction here rather than trusting the model to always follow
// it.
const TYPOGRAPHIC_REPLACEMENTS: [RegExp, string][] = [
    [/[\u2013\u2014]/g, "-"],
    [/[\u2018\u2019]/g, "'"],
    [/[\u201c\u201d]/g, '"'],
];

export function sanitizeGeneratedText(value: string): string {
    let cleaned = value.normalize("NFC");
    for (const [pattern, replacement] of TYPOGRAPHIC_REPLACEMENTS) {
        cleaned = cleaned.replace(pattern, replacement);
    }
    return cleaned.replace(/[\u0080-\u009f]/g, "").trim();
}

// Where a word is actually used (Questions 312-316).
//
// This replaced a frequency scale — Essential through Niche — and the
// replacement is a different question, not a relabelling. "How often is
// this word used" flattens a legal term into "rare" and stops there;
// "where would you meet it" says it's ordinary inside its field and
// absent outside, which is the part that actually tells you whether to
// bother. Six rather than four because "formal or technical" was hiding
// two different payoffs, and "specialized or dialect" was hiding three
// different pieces of advice (Answer 313).
//
// Unordered on purpose, unlike the scale it replaced. Nothing here ranks
// above anything else: jargon is essential to someone studying that
// field and useless to everyone else, which is exactly what a ranked
// scale could not say.
export const USED_IN_VALUES = [
    "Everyday conversation",
    "Slang or very informal",
    "Reading & media",
    "Formal or academic",
    "Technical or professional jargon",
    "Archaic, dialect, or regional",
] as const;

export const USED_IN_HINTS: Record<string, string> = {
    "Everyday conversation": "Ordinary spoken language — safe anywhere.",
    "Slang or very informal":
        "Current and casual. Useful, but easy to misplace and quick to date.",
    "Reading & media": "Books, news, film and television rather than speech.",
    "Formal or academic": "Careful writing, official language, study.",
    "Technical or professional jargon":
        "Ordinary inside one field, rarely met outside it.",
    "Archaic, dialect, or regional":
        "Worth recognising in older or local texts; not for speaking.",
};
