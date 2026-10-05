"use server";

import { auth } from "@/auth";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
    INLINE_TRANSLATE_MAX_CHARACTERS as MAX_CONTEXT_LENGTH,
    INLINE_TRANSLATE_MAX_PHRASES as MAX_PHRASES,
} from "@/lib/limits";
// Shared with the vocabulary enrich modal rather than given its own
// number: it is the same question — how many languages at once is
// reasonable — asked in a different place.
import { MAX_TRANSLATION_LANGUAGES as MAX_LANGUAGES } from "@/lib/vocabulary-enrichment";

// Returns failures rather than throwing them, so the message survives a
// production build — see lib/action-result.ts. Unauthorized still throws:
// it isn't something the user can act on, and it shouldn't be rendered as
// friendly copy.
// One marked phrase, translated into every language that was asked for.
export interface PhraseTranslation {
    language: string;
    text: string;
}

// A list per language since Question 339, rather than one string per
// phrase. The phrases themselves stay positional — the prompt has always
// asked for the same order and the length check below has always caught a
// mismatch — but the languages inside each phrase are matched by name,
// because a model that answers two of three languages would otherwise file
// the second under the wrong one. Same reasoning enrichment uses for its
// per-language forms.
export async function translateMarkedPhrases(
    phrases: string[],
    fullText: string,
    targetLanguages: string[],
): Promise<ActionResult<PhraseTranslation[][]>> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    if (phrases.length === 0) {
        return actionError("Mark at least one word before translating.");
    }

    // De-duplicated case-insensitively, the same way enrichment does it:
    // the same language asked for twice costs a slot in the prompt and
    // produces one answer either way.
    const seen = new Set<string>();
    const languages = targetLanguages
        .map((language) => language.trim())
        .filter((language) => {
            if (!language) return false;
            const key = language.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    if (languages.length === 0) {
        return actionError("Choose at least one language to translate into.");
    }
    if (languages.length > MAX_LANGUAGES) {
        return actionError(
            `That's ${languages.length} languages — please choose ${MAX_LANGUAGES} or fewer at a time.`,
        );
    }

    // The cap moves with the number of languages, because the response now
    // grows with phrases x languages rather than with phrases alone. Sixty
    // marked words into one language, fifteen into four — the same amount
    // of translation either way, which is what the limit was ever about.
    const maxPhrases = Math.max(1, Math.floor(MAX_PHRASES / languages.length));
    if (phrases.length > maxPhrases) {
        return actionError(
            languages.length > 1
                ? `That's ${phrases.length} marked items across ${languages.length} languages — please translate ${maxPhrases} or fewer at a time, or choose fewer languages.`
                : `That's ${phrases.length} marked items — please translate ${maxPhrases} or fewer at a time.`,
        );
    }

    if (fullText.length > MAX_CONTEXT_LENGTH) {
        return actionError(
            `That's ${fullText.length} characters — please translate a shorter passage at a time (up to ${MAX_CONTEXT_LENGTH} characters).`,
        );
    }

    const languageList = languages.join(", ");

    let answers: { translations: { language: string; text: string }[] }[];
    try {
        const result = await generateText({
            model: google("gemini-3.5-flash-lite"),
            output: Output.array({
                element: z.object({
                    translations: z.array(
                        z.object({ language: z.string(), text: z.string() }),
                    ),
                }),
            }),
            prompt: `A language learner marked some words and phrases while reading the passage below, and wants each one translated into ${languageList}.

Full passage (context only — do not translate this block itself):
"""
${fullText}
"""

Translate each of the following ${phrases.length} marked items into EACH of these languages: ${languageList}. Some items are multi-word phrases (like phrasal verbs or fixed expressions) — translate those as a single unit with their combined meaning, not word by word.

Return exactly ${phrases.length} objects, in the same order as the input, one per marked item. Each object holds a "translations" list with one entry per language: "language" copied back exactly as written above, and "text" holding just the translation itself, with no numbering, labels or extra commentary. Do not skip a language, and do not add one that was not asked for.

Marked items:
${phrases.map((phrase, index) => `${index + 1}. ${phrase}`).join("\n")}`,
        });
        answers = result.output;
    } catch (err) {
        console.error("translateMarkedPhrases failed:", err);
        return actionError(describeAiError(err, "Translation service").message);
    }

    if (answers.length !== phrases.length) {
        return actionError(
            "The translation didn't come back with the expected number of items — try again.",
        );
    }

    // Rebuilt in the order the languages were asked for, keyed by name, so
    // the stored language is the canonical spelling this app uses rather
    // than whatever casing came back — the same reason enrichment does it,
    // and it matters more here because these names become the language of a
    // vocabulary row when a word is saved.
    const byPhrase = answers.map((answer) => {
        const returned = new Map(
            (answer.translations ?? []).map((item) => [
                item.language.trim().toLowerCase(),
                item.text,
            ]),
        );
        return languages.flatMap((language) => {
            const text = returned.get(language.toLowerCase());
            return typeof text === "string" && text.trim()
                ? [{ language, text: text.trim() }]
                : [];
        });
    });

    return actionOk(byPhrase);
}
