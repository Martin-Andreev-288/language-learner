"use server";

import { auth } from "@/auth";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
    WORD_LOOKUP_MAX_CONTEXT_LENGTH as MAX_CONTEXT_LENGTH,
    WORD_LOOKUP_MAX_WORD_LENGTH as MAX_WORD_LENGTH,
} from "@/lib/limits";

const lookupSchema = z.object({
    definition: z.string(),
    examples: z.array(z.string()),
    languageCode: z
        .string()
        .describe(
            'BCP-47 language tag for the language the phrase is written in, e.g. "bg-BG", "de-DE", "fr-FR" — used to pick the right voice for text-to-speech playback, not shown to the user.',
        ),
});

// Returns failures rather than throwing them, so the message survives a
// production build — see lib/action-result.ts.
export async function lookupWord(
    word: string,
    context: string,
): Promise<ActionResult<z.infer<typeof lookupSchema>>> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const trimmedWord = word.trim();
    if (!trimmedWord) {
        return actionError("There's no word to look up.");
    }
    if (trimmedWord.length > MAX_WORD_LENGTH) {
        return actionError("That's too long to be a single word — try clicking just one word.");
    }
    if (context.length > MAX_CONTEXT_LENGTH) {
        return actionError(
            `The surrounding phrase is too long — please keep it under ${MAX_CONTEXT_LENGTH} characters.`,
        );
    }

    let result: z.infer<typeof lookupSchema>;
    try {
        const response = await generateText({
            model: google("gemini-3.6-flash"),
            output: Output.object({ schema: lookupSchema }),
            prompt: `A language learner clicked on the word "${trimmedWord}" while reading this phrase:
"""
${context}
"""

Explain "${trimmedWord}" as it's actually used in that phrase — if it has multiple meanings, use the sense that fits here, not just the most common dictionary sense. Return:
- definition: a short, clear definition, in plain language.
- examples: 2-3 short example sentences using "${trimmedWord}" (or its base form) in other contexts, so the learner can recognize it elsewhere.
- languageCode: the BCP-47 language tag for the language the phrase itself is written in (not the language of the definition).`,
        });
        result = response.output;
    } catch (err) {
        console.error("lookupWord failed:", err);
        return actionError(describeAiError(err, "Lookup service").message);
    }

    return actionOk(result);
}
