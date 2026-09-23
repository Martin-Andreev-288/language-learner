"use server";

import { auth } from "@/auth";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
    WORD_TRANSLATE_MAX_CHARACTERS as MAX_CHARACTERS,
    WORD_TRANSLATE_MAX_LANGUAGES as MAX_LANGUAGES,
} from "@/lib/limits";

// Returns failures rather than throwing them, so the message survives a
// production build — see lib/action-result.ts.
//
// Languages are named ("German"), not coded ("de"), matching the rest of the
// app: LanguageCombobox collects a name, and getDefaultTranslateLanguage
// returns one. A code-based API would have forced a lookup table on every
// caller for no gain, since the model reads names perfectly well.
//
// `sourceLanguage` is optional. Left out, the model detects it — which is
// what lets the page work with a single input and no source picker at all.
export async function translateWord(
    word: string,
    targetLanguages: string[],
    sourceLanguage?: string,
): Promise<ActionResult<string[]>> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const trimmedWord = word.trim();
    if (!trimmedWord) {
        return actionError("Type a word to translate.");
    }
    if (trimmedWord.length > MAX_CHARACTERS) {
        return actionError(
            `That's too long to be a single word — please keep it under ${MAX_CHARACTERS} characters.`,
        );
    }

    const targets = targetLanguages
        .map((language) => language.trim())
        .filter(Boolean);

    if (targets.length === 0) {
        return actionError("Choose at least one language to translate into.");
    }
    if (targets.length > MAX_LANGUAGES) {
        return actionError(
            `That's ${targets.length} languages — please translate into ${MAX_LANGUAGES} or fewer at a time.`,
        );
    }

    const source = sourceLanguage?.trim();
    const sourceClause = source ? ` from ${source}` : "";

    let translations: string[];
    try {
        const result = await generateText({
            model: google("gemini-3.8-flash"),
            output: Output.array({ element: z.string() }),
            // The two "dictionary form" rules pull against each other on
            // purpose, and both are load-bearing. Without the first, Bulgarian
            // "наведнъж" came back as Spanish "repente" — a fragment that
            // isn't a usable word, since the expression is "de repente".
            // Adding the first rule alone then over-corrected into "el perro"
            // and "der Hund" for plain nouns, so the second exists to stop it.
            prompt: `Translate the word "${trimmedWord}"${sourceClause} into each of these languages, in this exact order: ${targets.join(", ")}.

Return exactly ${targets.length} translations, one per language, in the same order as that list, with no labels, numbering, quotes, or commentary — just the translation itself.

Give the translation as a dictionary would list it:
- Keep every word the expression needs to stand on its own, including any preposition or particle ("de repente", never bare "repente"; "the day after tomorrow", not "tomorrow").
- Do not bolt a definite or indefinite article onto a plain noun: "perro", not "el perro"; "Hund", not "der Hund".
- Match the part of speech of the original — an adverb translates to an adverb, a verb to a verb.
- If the word has several common senses, give the most frequent everyday one.
- If a target language is the same as the word's own language, return the word unchanged rather than a synonym.`,
        });
        translations = result.output;
    } catch (err) {
        // Log the real cause server-side — describeAiError's message is safe
        // to show a user, but shouldn't be the only record of what happened.
        console.error("translateWord failed:", err);
        return actionError(describeAiError(err, "Translation service").message);
    }

    // The client pairs these with its own language list by index, so a short
    // or long array would silently mislabel every entry after the gap.
    if (translations.length !== targets.length) {
        return actionError(
            "The translation didn't come back with one result per language — try again.",
        );
    }

    return actionOk(translations);
}
