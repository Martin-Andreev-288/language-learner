"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";
import { WORD_CATEGORIES } from "@/lib/word-categories";
import { USED_IN_VALUES } from "@/lib/vocabulary-enrichment";
import { actionError, actionOk } from "@/lib/action-result";
import {
    ENRICHABLE_FIELDS,
    MAX_CATEGORIES_PER_WORD,
    MAX_ENRICH_WORDS,
    MAX_TRANSLATION_LANGUAGES,
    sanitizeGeneratedText,
    type EnrichableField,
    type EnrichOptions,
} from "@/lib/vocabulary-enrichment";

// What each field asks the model for. Kept beside the schema builder so a
// field can't be added to one without the other.
const FIELD_PROMPTS: Record<EnrichableField, string> = {
    // The only field whose answer is a list rather than a value, because
    // it's the only one asked once per target language instead of once per
    // word (Question 326). The instruction names the languages explicitly
    // and asks for the name copied back, for the same reason usedIn and
    // category do: a language name that doesn't match what was asked for
    // is a row nothing can later group by.
    translation:
        "translation: a list of the word's translations, one for EACH of these languages: {{TARGET}}. Return one object per language, with `language` copied back exactly as written above and `text` holding just the translation itself — if there are two or three genuinely distinct common senses, separate them with commas. Do not skip a language, and do not add one that isn't listed.",
    level:
        "level: the CEFR level of this word for a learner of that language — exactly one of A1, A2, B1, B2, C1, C2, and nothing else.",
    nounInfo:
        'nounInfo: ONLY if the word is a noun — its grammatical gender and plural, as one very short inline chunk. Use a single letter for gender where the language has grammatical gender (German: m, f, n), then a comma, then the plural in the abbreviated form that language conventionally uses — e.g. for German "m, ¨-e" (Zug), "f, -n" (Treppe), "m, -" (Wäscheständer). Write the plural out in full instead when an abbreviation would be unclear. If the language has no grammatical gender, give only the plural. If the word is NOT a noun, return an empty string and nothing else. Use a plain ASCII hyphen (-) for the dash, never an en dash or em dash.',
    wordFamily:
        "wordFamily: other words built from the same root (e.g. for \"substantial\": substance, substantially, insubstantial). Comma-separated, 2-5 of them, in the word's own language.",
    synonyms:
        "synonyms: words with a close meaning, in the word's own language. Comma-separated, 2-5 of them.",
    aiExamples:
        "aiExamples: 2-3 short example sentences using the word naturally, in the word's own language. One sentence per line, no numbering or bullets.",
    collocations:
        "collocations: 3-5 very short, natural word pairings this word commonly appears in (e.g. \"make a decision\", \"heavy rain\") — short reusable chunks, not full sentences. One per line, no numbering or bullets.",
    partOfSpeech:
        "partOfSpeech: the word's most common part of speech (noun, verb, adjective, adverb, etc.) — a single word.",
    // Unlike every other field here, this one can't be judged from the word
    // alone — it's a claim about how the word sits in the language as a
    // whole. The prompt says so plainly rather than asking for it in the
    // same breath as gender or part of speech (Answer 298). It also says
    // outright that this is not a ranking, because the values read like
    // one and a model asked for "the best" answer will invent an order
    // that isn't there.
    //
    // The six are listed as bare names on their own lines, and the guidance
    // for them sits in a separate sentence afterwards. The first version put
    // each explanation in brackets beside its value and asked for the phrase
    // "exactly as written" — which came back wrong on all eight test words,
    // every one of them carrying its bracket along ("Everyday conversation
    // (ordinary spoken language)"). The judgment was right every time; only
    // the copying was wrong, and a value that doesn't match the list exactly
    // is a value its own filter can't group (Question 316).
    usedIn:
        "usedIn: the kind of situation this word actually belongs to. Choose the closest match from this list:\n{{USED_IN}}\nCopy the chosen name exactly as written, with nothing added to it. For guidance: everyday conversation is ordinary spoken language; slang is casual and current; reading and media means books, news and film rather than speech; formal or academic means careful writing, official language and study; jargon is ordinary inside one field and rarely met outside it; archaic, dialect or regional belongs to older or local texts rather than to speaking. This is not a ranking and none of them is better than another — a technical term is not a worse word than an everyday one, it just belongs somewhere else.",
    // One topic normally, two when the word genuinely sits in both — a
    // sailor's knot is as much sea as it is tools, and forcing a choice
    // there loses whichever half you didn't pick (Question 320). Two is the
    // ceiling because past that a category stops narrowing anything.
    //
    // Separated by a semicolon, and the instruction says why: 36 of the 63
    // topic names contain a comma of their own, so asking for
    // comma-separated topics would produce a string nothing could take
    // apart again.
    //
    // The two examples are load-bearing, not decoration. An earlier version
    // said "only if the word belongs to two of them equally", and across
    // sixteen test words — including a sports doctor, a music teacher and a
    // vet — it produced a second topic exactly zero times. "Equally" reads
    // as a bar almost nothing clears. Naming two concrete pairs fixed it
    // without the opposite failure: the same run kept dog, rain, apple and
    // chair on one topic each (Question 320).
    category:
        "category: the topic this word belongs to. Choose from this list:\n{{CATEGORIES}}\nCopy each chosen name exactly as written, including any commas inside it. Give one topic when a single one clearly fits best. Give two when the word sits squarely in both — a sports doctor belongs to health and to sport, a cookbook to food and to books — separating them with a semicolon (;). Never more than two, and never a second topic that is merely related rather than genuinely a second home for the word. Use a semicolon and never a comma between the two, because many topic names contain commas themselves. If genuinely nothing on the list fits, write a short topic name of your own instead, two or three words at most.",
};

// Built per request from exactly the checked fields, per Question 242.
// Structurally excluding a field is stronger than asking the model to leave
// an optional one empty: a key that isn't in the schema at all cannot come
// back, where an optional key is only a prompt instruction it might ignore.
function buildResultSchema(fields: EnrichableField[]) {
    const wordShape: Record<string, z.ZodType> = {
        word: z
            .string()
            .describe("The word this entry is for, copied back exactly as given."),
    };
    for (const field of fields) {
        // Translation is the one field that comes back as a list — one
        // entry per requested language, each carrying the language it
        // answers for. Position would have been shorter, but a model that
        // returns two of three languages would then file the second one
        // under the wrong name, which is worse than missing it entirely —
        // the same reasoning that matches words by text below.
        wordShape[field] =
            field === "translation"
                ? z.array(z.object({ language: z.string(), text: z.string() }))
                : z.string();
    }
    return z.object({ results: z.array(z.object(wordShape)) });
}

// One returned translation, after the model has answered.
interface TranslationResult {
    language: string;
    text: string;
}

// One returned word. Only `word` has a shape known ahead of time — which
// of the other keys are present depends on what was checked in the modal,
// and their values are validated where they're read.
interface WordResult {
    word: string;
    [field: string]: unknown;
}

function isTranslationList(value: unknown): value is TranslationResult[] {
    return (
        Array.isArray(value) &&
        value.every(
            (item) =>
                typeof (item as TranslationResult)?.language === "string" &&
                typeof (item as TranslationResult)?.text === "string",
        )
    );
}

// The prompt asks for at most two topics; this is what happens when it
// asks anyway (Question 320). Enforced here rather than trusted to the
// prompt because the cap is the whole reason the field stays readable —
// a word filed under five topics is a word filed under none of them in
// any useful sense, and nothing downstream would have complained.
function capCategories(value: string): string {
    return value
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, MAX_CATEGORIES_PER_WORD)
        .join("; ");
}

// Pulls one word's translations out of the model's answer, in the order
// they were asked for.
//
// Driven by the requested languages rather than by what came back, which
// settles three things at once: a language the model invented is dropped,
// the stored name is the canonical spelling this app already uses
// everywhere else rather than whatever casing the model chose to echo, and
// the first entry is reliably the first language asked for — which is what
// the legacy single column gets filled from.
function readTranslations(
    result: Record<string, unknown>,
    requested: string[],
): TranslationResult[] {
    const raw = result.translation;
    if (!isTranslationList(raw)) return [];

    const byLanguage = new Map(
        raw.map((item) => [item.language.trim().toLowerCase(), item.text]),
    );

    const translations: TranslationResult[] = [];
    for (const language of requested) {
        const text = byLanguage.get(language.toLowerCase());
        if (typeof text !== "string" || !text.trim()) continue;
        translations.push({ language, text: sanitizeGeneratedText(text) });
    }
    return translations;
}

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }
    return session.user.id;
}

// Returns failures rather than throwing them, so the message survives a
// production build — see lib/action-result.ts.
export async function enrichVocabularyEntries(
    entryIds: string[],
    options: EnrichOptions,
) {
    const userId = await requireUserId();

    const fields = ENRICHABLE_FIELDS.filter((field) =>
        options.fields.includes(field),
    );
    if (fields.length === 0) {
        return actionError("Pick at least one kind of information to add.");
    }

    // De-duplicated case-insensitively, because the same language asked for
    // twice is one row either way — better to drop it here than to spend a
    // slot in the prompt on it and hit the unique constraint afterwards.
    const seenLanguages = new Set<string>();
    const translateInto = (options.translateInto ?? [])
        .map((language) => language.trim())
        .filter((language) => {
            if (!language) return false;
            const key = language.toLowerCase();
            if (seenLanguages.has(key)) return false;
            seenLanguages.add(key);
            return true;
        });

    if (fields.includes("translation") && translateInto.length === 0) {
        return actionError("Choose at least one language to translate into.");
    }
    if (translateInto.length > MAX_TRANSLATION_LANGUAGES) {
        return actionError(
            `That's ${translateInto.length} languages — please choose ${MAX_TRANSLATION_LANGUAGES} or fewer at a time.`,
        );
    }

    if (entryIds.length === 0) {
        return actionError("Select at least one word first.");
    }
    if (entryIds.length > MAX_ENRICH_WORDS) {
        return actionError(
            `That's ${entryIds.length} words — please select ${MAX_ENRICH_WORDS} or fewer at a time.`,
        );
    }

    // Scoped to this user, so an id belonging to someone else simply isn't
    // found rather than being enriched or leaking back.
    const entries = await prisma.vocabularyEntry.findMany({
        where: { id: { in: entryIds }, userId },
    });
    if (entries.length === 0) {
        return actionError("Those words couldn't be found.");
    }

    // The category list is only pasted in when a category was actually
    // asked for — it's the longest thing in this prompt by far, and there's
    // no reason to spend it on a batch that only wants translations.
    const requestedList = fields
        .map(
            (field) =>
                `- ${FIELD_PROMPTS[field]
                    .replace("{{TARGET}}", translateInto.join(", "))
                    .replace(
                        "{{CATEGORIES}}",
                        WORD_CATEGORIES.map((name) => `  - ${name}`).join("\n"),
                    )
                    // Formatted exactly like the category list above, which
                    // is the reason it's formatted that way at all — see the
                    // note on the usedIn prompt.
                    .replace(
                        "{{USED_IN}}",
                        USED_IN_VALUES.map((name) => `  - ${name}`).join("\n"),
                    )}`,
        )
        .join("\n");

    const wordList = entries
        .map((entry) => `- "${entry.word}" (${entry.language})`)
        .join("\n");

    const resultSchema = buildResultSchema(fields);
    // Declared rather than inferred from the schema, which is built at
    // runtime from whichever fields were checked: now that one of its keys
    // is an array and the rest are strings, inference can only widen every
    // value to `unknown`. Each field is checked for its own shape as it's
    // read below anyway — by typeof for the string ones, by
    // isTranslationList for the one that isn't.
    let output: { results: WordResult[] };
    try {
        const response = await generateText({
            model: google("gemini-3.6-flash"),
            output: Output.object({ schema: resultSchema }),
            prompt: `A language learner is studying these words. Each is listed with the language it's written in:
${wordList}

For every word above, return an object with the word copied back exactly as given, plus:
${requestedList}

Return one object per word, in the same order, and do not skip any.`,
        });
        output = response.output as { results: WordResult[] };
    } catch (err) {
        console.error("enrichVocabularyEntries failed:", err);
        return actionError(describeAiError(err, "Enrichment service").message);
    }

    // Matched by word text rather than by array position — the prompt asks
    // for the same order, but a mismatched or short list would otherwise
    // write one word's data onto another, which is worse than skipping it.
    const byWord = new Map(
        output.results.map((result) => [result.word.trim().toLowerCase(), result]),
    );

    let updated = 0;
    for (const entry of entries) {
        const result = byWord.get(entry.word.trim().toLowerCase());
        if (!result) continue;

        const data: Record<string, string> = {};
        for (const field of fields) {
            if (field === "translation") continue;
            const raw = (result as Record<string, unknown>)[field];
            if (typeof raw === "string" && raw.trim()) {
                const cleaned = sanitizeGeneratedText(raw);
                data[field] =
                    field === "category" ? capCategories(cleaned) : cleaned;
            }
        }

        // Translations are rows in their own table now, so they're written
        // separately from the entry's own columns rather than being one
        // more key in `data` (Question 326).
        const translations = fields.includes("translation")
            ? readTranslations(result, translateInto)
            : [];

        let addedTranslations = 0;
        if (translations.length > 0) {
            // skipDuplicates against the [entryId, language] unique
            // constraint *is* the fill-in-only rule from Answer 241, only
            // now applied per language: asking for French on a word that
            // already has a French translation leaves the existing one
            // alone. Hand-corrected text is never overwritten by a
            // generated one, which is exactly what that rule promised when
            // there was a single translation to promise it about.
            //
            // Its count is what gets read back, so a word whose languages
            // were all already filled isn't counted as updated — otherwise
            // re-running the same batch would report every word as changed
            // while changing nothing.
            const created = await prisma.vocabularyTranslation.createMany({
                data: translations.map(({ language, text }) => ({
                    entryId: entry.id,
                    language,
                    text,
                })),
                skipDuplicates: true,
            });
            addedTranslations = created.count;
            // Step 6a also copied the first translation into the old single
            // column here, to keep the list row and the Translation column
            // showing something until the real display existed. Both of
            // those are gone as of Question 333, and so is the copy — a
            // translation is now stored once, in the one place that knows
            // which language it's in.
        }

        if (Object.keys(data).length === 0) {
            // A word can now be genuinely updated without any of its own
            // columns changing — translations went to the other table.
            if (addedTranslations > 0) updated += 1;
            continue;
        }
        await prisma.vocabularyEntry.update({ where: { id: entry.id }, data });
        updated += 1;
    }

    return actionOk({ updated, requested: entries.length });
}
