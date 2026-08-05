"use server";

import { auth } from "@/auth";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";

const MAX_CHARACTERS = 4000;

const correctionSchema = z.object({
    original: z
        .string()
        .describe(
            "The exact minimal word or short phrase that is actually wrong — not the whole sentence around it, just the specific part that needs to change.",
        ),
    corrected: z
        .string()
        .describe("The corrected version of just that word or phrase, same length/scope as original."),
    explanation: z
        .string()
        .describe("A short, clear explanation of what was wrong and why the correction is better."),
});

const checkSchema = z.object({
    correctedText: z
        .string()
        .describe(
            "The full passage with every issue fixed, otherwise left exactly as written. Equal to the original text if there are no issues.",
        ),
    corrections: z.array(correctionSchema),
});

export async function checkWriting(text: string) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const trimmedText = text.trim();
    if (!trimmedText) {
        throw new Error("There's nothing to check yet.");
    }

    if (trimmedText.length > MAX_CHARACTERS) {
        throw new Error(
            `That's ${trimmedText.length} characters — please check ${MAX_CHARACTERS} or fewer at a time.`,
        );
    }

    let output: z.infer<typeof checkSchema>;
    try {
        const result = await generateText({
            model: google("gemini-3.6-flash"),
            output: Output.object({ schema: checkSchema }),
            prompt: `You are reviewing a piece of writing for mistakes — grammar, word choice, clarity, or phrasing that reads as incorrect or awkward, not only strict grammar rules.

For each mistake found, identify the exact minimal word or phrase that is wrong — not the whole sentence it appears in, just the specific part that needs to change — its corrected version, and a short explanation of what was wrong and why the correction is better. If the mistake is a single wrong word, "original" should be that one word, not the sentence around it. If the text has no notable issues, return an empty corrections list — do not invent issues just to have something to report.

Also return the full passage with every issue fixed and everything else left exactly as written — not a summary or a rewrite, just the same text with the mistakes corrected.

Text to review:
"""
${trimmedText}
"""`,
        });
        output = result.output;
    } catch (err) {
        console.error("checkWriting failed:", err);
        throw describeAiError(err, "Writing check service");
    }

    return output;
}
