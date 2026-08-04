"use server";

import { auth } from "@/auth";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";

const MAX_CHARACTERS = 4000;

const correctionSchema = z.object({
    original: z.string().describe("The exact sentence or phrase containing the issue."),
    corrected: z.string().describe("The corrected version of that sentence or phrase."),
    explanation: z
        .string()
        .describe("A short, clear explanation of what was wrong and why the correction is better."),
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

    let corrections: z.infer<typeof correctionSchema>[];
    try {
        const result = await generateText({
            model: google("gemini-3.6-flash"),
            output: Output.array({ element: correctionSchema }),
            prompt: `You are reviewing a piece of writing for mistakes — grammar, word choice, clarity, or phrasing that reads as incorrect or awkward, not only strict grammar rules. For each mistake found, identify the exact original sentence or phrase, a corrected version, and a short explanation of what was wrong and why the correction is better.

If the text has no notable issues, return an empty list — do not invent issues just to have something to report.

Text to review:
"""
${trimmedText}
"""`,
        });
        corrections = result.output;
    } catch (err) {
        console.error("checkWriting failed:", err);
        throw describeAiError(err, "Writing check service");
    }

    return corrections;
}
