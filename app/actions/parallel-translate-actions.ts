"use server";

import { auth } from "@/auth";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
    PARALLEL_TRANSLATE_MAX_CHARACTERS as MAX_CHARACTERS,
    PARALLEL_TRANSLATE_MAX_SENTENCES as MAX_SENTENCES,
} from "@/lib/limits";

// Returns failures rather than throwing them, so the message survives a
// production build — see lib/action-result.ts.
export async function translateSentences(
    sentences: string[],
    sourceText: string,
    targetLanguage: string,
): Promise<ActionResult<string[]>> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    if (sentences.length === 0) {
        return actionError("There's nothing to translate yet.");
    }

    if (sentences.length > MAX_SENTENCES) {
        return actionError(
            `That's ${sentences.length} sentences — please translate ${MAX_SENTENCES} or fewer at a time.`,
        );
    }

    if (sourceText.length > MAX_CHARACTERS) {
        return actionError(
            `That's ${sourceText.length} characters — please translate ${MAX_CHARACTERS} or fewer at a time.`,
        );
    }

    const targetLanguageName = targetLanguage.trim() || "the target language";

    let translations: string[];
    try {
        const result = await generateText({
            model: google("gemini-3.5-flash-lite"),
            output: Output.array({ element: z.string() }),
            prompt: `You are translating a passage into ${targetLanguageName}, one sentence at a time.

Full passage (context only — do not translate this block itself, it's here so ambiguous words, pronouns, and idioms in the individual sentences below can be translated correctly):
"""
${sourceText}
"""

Translate each of the following ${sentences.length} sentences into ${targetLanguageName}. Return exactly ${sentences.length} translations, in the same order as the input, one per sentence, with no numbering, labels, or extra commentary — just the translated sentence text.

Sentences:
${sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join("\n")}`,
        });
        translations = result.output;
    } catch (err) {
        // Log the real cause server-side — describeAiError's message is safe
        // to show a user, but shouldn't be the only record of what happened.
        console.error("translateSentences failed:", err);
        return actionError(describeAiError(err, "Translation service").message);
    }

    if (translations.length !== sentences.length) {
        return actionError(
            "The translation didn't come back with the expected number of sentences — try again.",
        );
    }

    return actionOk(translations);
}
