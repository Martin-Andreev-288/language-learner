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
    sanitizeGeneratedText,
    type EnrichableField,
    type EnrichOptions,
} from "@/lib/vocabulary-enrichment";

// What each field asks the model for. Kept beside the schema builder so a
// field can't be added to one without the other.
const FIELD_PROMPTS: Record<EnrichableField, string> = {
    translation:
        "translation: the word's translation into {{TARGET}}. Just the translation itself — if there are two or three genuinely distinct common senses, separate them with commas.",
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
    const wordShape: Record<string, z.ZodString> = {
        word: z
            .string()
            .describe("The word this entry is for, copied back exactly as given."),
    };
    for (const field of fields) {
        wordShape[field] = z.string();
    }
    return z.object({ results: z.array(z.object(wordShape)) });
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

    const translateInto = options.translateInto?.trim() ?? "";
    if (fields.includes("translation") && !translateInto) {
        return actionError("Choose a language to translate into.");
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
                    .replace("{{TARGET}}", translateInto)
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
    let output: z.infer<ReturnType<typeof buildResultSchema>>;
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
        output = response.output;
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
            // Translation is fill-in-only (Answer 241) — a translation the
            // user already has, typed or carried from Inline Translate, is
            // never overwritten by a generated one.
            if (field === "translation" && entry.translation) continue;
            const raw = (result as Record<string, string | undefined>)[field];
            if (typeof raw === "string" && raw.trim()) {
                const cleaned = sanitizeGeneratedText(raw);
                data[field] =
                    field === "category" ? capCategories(cleaned) : cleaned;
            }
        }

        if (Object.keys(data).length === 0) continue;
        await prisma.vocabularyEntry.update({ where: { id: entry.id }, data });
        updated += 1;
    }

    return actionOk({ updated, requested: entries.length });
}
