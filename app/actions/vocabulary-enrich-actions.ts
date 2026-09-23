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
    isPerLanguageField,
    MAX_CATEGORIES_PER_WORD,
    MAX_TRANSLATION_LANGUAGES,
    maxWordsForLanguageCount,
    sanitizeGeneratedText,
    type EnrichableField,
    type EnrichOptions,
    type PerLanguageEnrichableField,
} from "@/lib/vocabulary-enrichment";

// What each field asks the model for. Kept beside the schema builder so a
// field can't be added to one without the other.
const FIELD_PROMPTS: Record<EnrichableField, string> = {
    // Describes `text` inside a form rather than a key of its own since
    // Question 335 — see buildResultSchema. Still listed here so the modal
    // and the prompt stay driven by one list of fields.
    translation:
        "text: the word written in that form's language. For the word's own language this is simply the word itself, copied back. For any other language it's the translation — just the translation itself, and if there are two or three genuinely distinct common senses, separate them with commas.",
    // Every per-language prompt below says "this form's word" rather than
    // "the word", because since Question 335 the same field is answered
    // once per language and the answers genuinely differ. Judging the
    // German level of a French word is the exact mistake this wording
    // exists to prevent.
    level:
        "level: the CEFR level of THIS FORM'S word, for a learner of this form's language — exactly one of A1, A2, B1, B2, C1, C2, and nothing else. Judge the word as written in this form's language, not the original.",
    nounInfo:
        'nounInfo: ONLY if THIS FORM\'S word is a noun — its grammatical gender and plural, as one very short inline chunk. Use a single letter for gender where the language has grammatical gender (German: m, f, n), then a comma, then the plural in the abbreviated form that language conventionally uses — e.g. for German "m, ¨-e" (Zug), "f, -n" (Treppe), "m, -" (Wäscheständer). Write the plural out in full instead when an abbreviation would be unclear. If the language has no grammatical gender, give only the plural. If the word is NOT a noun, return an empty string and nothing else. Use a plain ASCII hyphen (-) for the dash, never an en dash or em dash.',
    wordFamily:
        "wordFamily: other words built from the same root as THIS FORM'S word (e.g. for \"substantial\": substance, substantially, insubstantial). Comma-separated, 2-5 of them, in this form's language.",
    synonyms:
        "synonyms: words with a close meaning to THIS FORM'S word, in this form's language. Comma-separated, 2-5 of them.",
    aiExamples:
        "aiExamples: 2-3 short example sentences using THIS FORM'S word naturally, written in this form's language. One sentence per line, no numbering or bullets.",
    collocations:
        "collocations: 3-5 very short, natural word pairings THIS FORM'S word commonly appears in, in this form's language (e.g. \"make a decision\", \"heavy rain\") — short reusable chunks, not full sentences. One per line, no numbering or bullets.",
    partOfSpeech:
        "partOfSpeech: the most common part of speech of THIS FORM'S word (noun, verb, adjective, adverb, etc.) — a single word.",
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
// The result is two-tiered since Question 335, mirroring the two kinds of
// thing being asked for: what's true of the *meaning* sits on the word,
// what's true of a *word in a language* sits in `forms`, one entry per
// language. `translation` stopped being its own key and became the `text`
// of a form, because a translation and that translation's own level and
// synonyms are answers about the same thing and splitting them across two
// shapes would only invite them to disagree.
function buildResultSchema(
    sharedFields: EnrichableField[],
    formFields: PerLanguageEnrichableField[],
    wantsForms: boolean,
) {
    const wordShape: Record<string, z.ZodType> = {
        word: z
            .string()
            .describe("The word this entry is for, copied back exactly as given."),
    };
    for (const field of sharedFields) {
        wordShape[field] = z.string();
    }

    if (wantsForms) {
        const formShape: Record<string, z.ZodType> = {
            language: z.string(),
            text: z.string(),
        };
        for (const field of formFields) {
            formShape[field] = z.string();
        }
        // A list rather than a key per language, and matched by name when
        // it's read back: a model that returns two of three languages would
        // otherwise file the second one under the wrong name, which is
        // worse than missing it — the same reasoning that matches words by
        // text rather than by position.
        wordShape.forms = z.array(z.object(formShape));
    }

    return z.object({ results: z.array(z.object(wordShape)) });
}

// One returned word-in-a-language: the word itself in that language, plus
// whichever per-language fields were checked.
interface FormResult {
    language: string;
    text: string;
    [field: string]: unknown;
}

// One returned word. Only `word` has a shape known ahead of time — which
// of the other keys are present depends on what was checked in the modal,
// and their values are validated where they're read.
interface WordResult {
    word: string;
    [field: string]: unknown;
}

function isFormList(value: unknown): value is FormResult[] {
    return (
        Array.isArray(value) &&
        value.every(
            (item) =>
                typeof (item as FormResult)?.language === "string" &&
                typeof (item as FormResult)?.text === "string",
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

// Pulls one word's language forms out of the model's answer, keyed by the
// languages that were actually asked for.
//
// Driven by the requested languages rather than by what came back, which
// settles two things at once: a language the model invented is dropped,
// and the stored name is the canonical spelling this app uses everywhere
// else rather than whatever casing the model chose to echo — which matters
// because that name is what a per-language row is keyed by.
function readForms(
    result: Record<string, unknown>,
    requested: string[],
): Map<string, FormResult> {
    const raw = result.forms;
    if (!isFormList(raw)) return new Map();

    const returned = new Map(
        raw.map((form) => [form.language.trim().toLowerCase(), form]),
    );

    const forms = new Map<string, FormResult>();
    for (const language of requested) {
        const form = returned.get(language.toLowerCase());
        if (form) forms.set(language, form);
    }
    return forms;
}

// The generated string fields of one form, cleaned and ready to store.
// Empty answers are dropped rather than written as blanks: a model that
// has nothing to say about a word's gender should leave the field as it
// was, not erase what's there.
function readFormFields(
    form: FormResult,
    fields: PerLanguageEnrichableField[],
): Record<string, string> {
    const data: Record<string, string> = {};
    for (const field of fields) {
        const raw = form[field];
        if (typeof raw === "string" && raw.trim()) {
            data[field] = sanitizeGeneratedText(raw);
        }
    }
    return data;
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

    // Which of the checked fields describe a word rather than a meaning,
    // and therefore get asked once per language (Question 335).
    const formFields = fields.filter(isPerLanguageField);
    const sharedFields = fields.filter(
        (field) => field !== "translation" && !isPerLanguageField(field),
    );
    const scope = options.scope ?? "own";

    // Translations are requested whenever the target languages are being
    // enriched, whether or not "Translation" itself was checked: the model
    // cannot describe the French word without naming it, and having named
    // it there's no reason to throw it away. Checking Translation on its
    // own still works exactly as before — it simply asks for forms with
    // nothing but their text.
    const enrichTargets =
        scope !== "own" && formFields.length > 0 && translateInto.length > 0;
    const wantsTranslations = fields.includes("translation") || enrichTargets;
    const enrichOwn = scope !== "translated" && formFields.length > 0;

    if (formFields.length > 0 && scope === "translated" && translateInto.length === 0) {
        return actionError(
            "Choose at least one language to translate into, or generate for the word's own language instead.",
        );
    }

    // The cap moves with how many languages each word is described in, so
    // one batch stays roughly the size it always was rather than
    // multiplying. Only per-language *enrichment* counts: translations
    // alone are four short strings, not four descriptions.
    const enrichedLanguageCount =
        formFields.length === 0
            ? 1
            : (enrichOwn ? 1 : 0) + (enrichTargets ? translateInto.length : 0);
    const maxWords = maxWordsForLanguageCount(enrichedLanguageCount);

    if (entryIds.length === 0) {
        return actionError("Select at least one word first.");
    }
    if (entryIds.length > maxWords) {
        return actionError(
            enrichedLanguageCount > 1
                ? `That's ${entryIds.length} words across ${enrichedLanguageCount} languages — please select ${maxWords} or fewer at a time, or generate for fewer languages.`
                : `That's ${entryIds.length} words — please select ${maxWords} or fewer at a time.`,
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

    // What `forms` should contain, said in words rather than left to the
    // schema — the schema can only say "a list of forms", since which
    // languages belong to a word depends on that word's own language.
    const wantsForms = wantsTranslations || enrichOwn;
    const formInstruction = wantsForms
        ? `\nEach word also gets a "forms" list. Return one form for ${[
            enrichOwn || !wantsTranslations
                ? "the word's own language (the one shown in brackets beside it)"
                : null,
            wantsTranslations && translateInto.length > 0
                ? `each of these languages: ${translateInto.join(", ")}`
                : null,
        ]
            .filter(Boolean)
            .join(", and one for ")}. Copy each language name exactly as written above. Do not add a form for any other language.${enrichedLanguageCount > 1
                ? " Keep every list short — two examples and three collocations per form is plenty, since you are answering for several languages at once."
                : ""
        }`
        : "";

    const resultSchema = buildResultSchema(
        sharedFields,
        // A form carries only the per-language fields when they were asked
        // for in a scope that reaches it. Asking for translations alone
        // gives forms holding nothing but their text, which is exactly what
        // a translation was before this step.
        formFields,
        wantsForms,
    );
    // Declared rather than inferred from the schema, which is built at
    // runtime from whichever fields were checked: now that one of its keys
    // is an array and the rest are strings, inference can only widen every
    // value to `unknown`. Each field is checked for its own shape as it's
    // read below anyway — by typeof for the string ones, by
    // isTranslationList for the one that isn't.
    let output: { results: WordResult[] };
    try {
        const response = await generateText({
            model: google("gemini-3.8-flash"),
            output: Output.object({ schema: resultSchema }),
            prompt: `A language learner is studying these words. Each is listed with the language it's written in:
${wordList}

For every word above, return an object with the word copied back exactly as given, plus:
${requestedList}
${formInstruction}

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

        // What describes the meaning: written once on the entry, whatever
        // the scope says, because these survive translation.
        const data: Record<string, string> = {};
        for (const field of sharedFields) {
            const raw = (result as Record<string, unknown>)[field];
            if (typeof raw === "string" && raw.trim()) {
                const cleaned = sanitizeGeneratedText(raw);
                data[field] =
                    field === "category" ? capCategories(cleaned) : cleaned;
            }
        }

        // Every language this word was asked about — its own first, so a
        // form the model returned for the source language is matched by
        // that entry's language rather than by position.
        const askedLanguages = [
            ...(wantsForms ? [entry.language] : []),
            ...(wantsTranslations ? translateInto : []),
        ];
        const forms = readForms(result, askedLanguages);

        // The word's own form lands in the entry's own columns — Option A
        // from Question 332: the source word keeps its enrichment where it
        // has always lived, and only the translations needed somewhere new.
        const ownForm = enrichOwn ? forms.get(entry.language) : undefined;
        if (ownForm) {
            Object.assign(data, readFormFields(ownForm, formFields));
        }

        let touchedTranslations = 0;
        for (const language of translateInto) {
            if (!wantsTranslations) break;
            const form = forms.get(language);
            if (!form) continue;

            const text = sanitizeGeneratedText(form.text ?? "");
            const enrichment = enrichTargets
                ? readFormFields(form, formFields)
                : {};
            if (!text && Object.keys(enrichment).length === 0) continue;

            // Upsert rather than the insert this used to be, because a
            // translation now has fields that can be refreshed on a word
            // that already has one. The two halves keep different rules,
            // and both are the rules they already had: the text is
            // fill-in-only (Answer 241 — a translation you corrected by
            // hand is never overwritten), while the generated fields
            // refresh, exactly as the entry's own columns always have.
            const existing = await prisma.vocabularyTranslation.findUnique({
                where: {
                    entryId_language: { entryId: entry.id, language },
                },
                select: { id: true },
            });

            if (!existing) {
                if (!text) continue;
                await prisma.vocabularyTranslation.create({
                    data: { entryId: entry.id, language, text, ...enrichment },
                });
                touchedTranslations += 1;
                continue;
            }

            if (Object.keys(enrichment).length === 0) continue;
            await prisma.vocabularyTranslation.update({
                where: { id: existing.id },
                data: enrichment,
            });
            touchedTranslations += 1;
        }

        if (Object.keys(data).length === 0) {
            // A word can be genuinely updated without any of its own
            // columns changing — everything may have landed on its
            // translations instead.
            if (touchedTranslations > 0) updated += 1;
            continue;
        }
        await prisma.vocabularyEntry.update({ where: { id: entry.id }, data });
        updated += 1;
    }

    return actionOk({ updated, requested: entries.length });
}
