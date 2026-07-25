"use server";

import { auth } from "@/auth";
import { generateText, Output, APICallError, LoadAPIKeyError, RetryError } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const MAX_SENTENCES = 30;
const MAX_CHARACTERS = 2500;

export async function translateSentences(
    sentences: string[],
    sourceText: string,
    targetLanguage: string,
) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    if (sentences.length === 0) {
        throw new Error("There's nothing to translate yet.");
    }

    if (sentences.length > MAX_SENTENCES) {
        throw new Error(
            `That's ${sentences.length} sentences — please translate ${MAX_SENTENCES} or fewer at a time.`,
        );
    }

    if (sourceText.length > MAX_CHARACTERS) {
        throw new Error(
            `That's ${sourceText.length} characters — please translate ${MAX_CHARACTERS} or fewer at a time.`,
        );
    }

    const targetLanguageName = targetLanguage.trim() || "the target language";

    let translations: string[];
    try {
        const result = await generateText({
            model: google("gemini-3.6-flash"),
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
        // Log the real cause server-side — the messages below are safe to
        // show a user, but shouldn't be the only record of what happened.
        console.error("translateSentences failed:", err);

        const cause = RetryError.isInstance(err) ? err.lastError : err;

        if (LoadAPIKeyError.isInstance(cause)) {
            throw new Error(
                "No Google Generative AI API key found — add GOOGLE_GENERATIVE_AI_API_KEY to .env and restart the dev server (Next.js only reads .env at startup, so a key added while it's already running won't be picked up until it's restarted).",
            );
        }

        if (APICallError.isInstance(cause)) {
            if (cause.statusCode === 429 || /quota/i.test(cause.message)) {
                throw new Error(
                    "Google's API says this key is over its quota for this model — check the billing/quota page for this key in Google AI Studio.",
                );
            }
            if (cause.statusCode === 503 || /overloaded|high demand/i.test(cause.message)) {
                throw new Error(
                    "Gemini is temporarily overloaded on Google's side — wait a bit and try again.",
                );
            }
            throw new Error(`Translation service error: ${cause.message}`);
        }

        throw new Error(
            "Couldn't reach the translation service — check the server console for the underlying error.",
        );
    }

    if (translations.length !== sentences.length) {
        throw new Error(
            "The translation didn't come back with the expected number of sentences — try again.",
        );
    }

    return translations;
}
