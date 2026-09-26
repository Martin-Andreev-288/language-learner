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
// `explainInLanguage` is the language the *answer* is written in — not the
// language of the word, which is worked out separately and only used to
// pick a pronunciation voice (Question 305).
//
// Optional, and left out entirely when empty, which is deliberate: with no
// instruction the model answers in English, which is exactly what this did
// before this parameter existed. So someone who hasn't set a default sees
// no change at all, and someone who has gets definitions in their own
// language without a second setting to manage.
export async function lookupWord(
    word: string,
    context: string,
    explainInLanguage?: string,
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

    const answerLanguage = explainInLanguage?.trim();
    // Added only when there's something to say. Two instructions rather than
    // one, and the second is the important half: asking for the answer in
    // another language makes the model translate the *examples* too unless
    // told plainly not to, which destroys their entire purpose — they exist
    // to show the word being used in its own language, and a translated
    // example shows nothing. Verified: without this sentence, an Italian
    // example came back rewritten in Bulgarian with the word itself
    // transliterated into something that isn't a word in either language.
    //
    // No "don't translate a language into itself" guard is needed here,
    // unlike the translate-into fields: explaining an Italian word in
    // Italian is an ordinary monolingual dictionary entry, not a
    // contradiction.
    const answerLanguageLine = answerLanguage
        ? `

Write the definition in ${answerLanguage}. The example sentences are NOT to be translated: leave them entirely in the same language as the phrase above, since their whole purpose is to show the word being used in its own language. Never transliterate or respell "${trimmedWord}" itself.`
        : "";

    let result: z.infer<typeof lookupSchema>;
    try {
        const response = await generateText({
            model: google("gemini-3.5-flash-lite"),
            output: Output.object({ schema: lookupSchema }),
            prompt: `A language learner clicked on the word "${trimmedWord}" while reading this phrase:
"""
${context}
"""

Explain "${trimmedWord}" as it's actually used in that phrase — if it has multiple meanings, use the sense that fits here, not just the most common dictionary sense. Return:
- definition: a short, clear definition, in plain language.
- examples: 2-3 short example sentences using "${trimmedWord}" (or its base form) in other contexts, so the learner can recognize it elsewhere.
- languageCode: the BCP-47 language tag for the language the phrase itself is written in (not the language of the definition).${answerLanguageLine}`,
        });
        result = response.output;
    } catch (err) {
        console.error("lookupWord failed:", err);
        return actionError(describeAiError(err, "Lookup service").message);
    }

    return actionOk(result);
}
