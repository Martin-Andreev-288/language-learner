"use server";

import { auth } from "@/auth";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";

const MAX_PHRASES = 40;
const MAX_CONTEXT_LENGTH = 3000;

export async function translateMarkedPhrases(
    phrases: string[],
    fullText: string,
    targetLanguage: string,
) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    if (phrases.length === 0) {
        throw new Error("Mark at least one word before translating.");
    }

    if (phrases.length > MAX_PHRASES) {
        throw new Error(
            `That's ${phrases.length} marked items — please translate ${MAX_PHRASES} or fewer at a time.`,
        );
    }

    if (fullText.length > MAX_CONTEXT_LENGTH) {
        throw new Error(
            `That's ${fullText.length} characters — please translate a shorter passage at a time (up to ${MAX_CONTEXT_LENGTH} characters).`,
        );
    }

    const targetLanguageName = targetLanguage.trim() || "the target language";

    let translations: string[];
    try {
        const result = await generateText({
            model: google("gemini-3.6-flash"),
            output: Output.array({ element: z.string() }),
            prompt: `A language learner marked some words and phrases while reading the passage below, and wants each one translated into ${targetLanguageName}.

Full passage (context only — do not translate this block itself):
"""
${fullText}
"""

Translate each of the following ${phrases.length} marked items into ${targetLanguageName}. Some items are multi-word phrases (like phrasal verbs or fixed expressions) — translate those as a single unit with their combined meaning, not word by word. Return exactly ${phrases.length} translations, in the same order as the input, one per item, with no numbering, labels, or extra commentary — just the translation.

Marked items:
${phrases.map((phrase, index) => `${index + 1}. ${phrase}`).join("\n")}`,
        });
        translations = result.output;
    } catch (err) {
        console.error("translateMarkedPhrases failed:", err);
        throw describeAiError(err, "Translation service");
    }

    if (translations.length !== phrases.length) {
        throw new Error(
            "The translation didn't come back with the expected number of items — try again.",
        );
    }

    return translations;
}
