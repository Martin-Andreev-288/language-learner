"use server";

import { auth } from "@/auth";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { describeAiError } from "@/lib/ai-error";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { CHAT_TRANSLATE_MAX_CHARACTERS as MAX_CHARACTERS } from "@/lib/limits";

// Translates one whole chat reply, on request (Question 277).
//
// Its own action rather than reusing translateMarkedPhrases or
// translateSentences: both of those take an array and return an array,
// because both exist to translate *pieces* of a passage while the passage
// itself is only context. Here the whole thing is the thing being
// translated, and there are no pieces — passing a paragraph as a single
// "marked phrase" would fit the signature while telling the model the
// opposite of what's wanted.
//
// Returns failures rather than throwing them, so the message survives a
// production build — see lib/action-result.ts. Unauthorized still throws:
// it isn't something the user can act on.
export async function translateChatMessage(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
): Promise<ActionResult<string>> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const message = text.trim();
    if (!message) {
        return actionError("There's nothing to translate in that message.");
    }

    const targetLanguageName = targetLanguage.trim();
    if (!targetLanguageName) {
        return actionError("Choose a language to translate into first.");
    }

    if (message.length > MAX_CHARACTERS) {
        return actionError(
            `That message is ${message.length} characters — too long to translate in one go (up to ${MAX_CHARACTERS} characters).`,
        );
    }

    const sourceLanguageName = sourceLanguage.trim();
    // Naming the source language helps with words that exist in more than
    // one language, but it's genuinely optional — the message speaks for
    // itself — so an empty language field doesn't block a translation.
    const origin = sourceLanguageName
        ? ` in ${sourceLanguageName}`
        : "";

    try {
        const result = await generateText({
            model: google("gemini-3.5-flash-lite"),
            prompt: `Translate the message below into ${targetLanguageName}.

It is a single turn from a language-practice conversation${origin}, spoken to a learner. Translate it naturally rather than word for word, keep its tone and any question it asks, and return only the translation itself — no notes, no labels, no surrounding quotation marks, and no commentary about the translation.

Message:
"""
${message}
"""`,
        });

        const translation = result.text.trim();
        if (!translation) {
            return actionError(
                "The translation came back empty — try again.",
            );
        }
        return actionOk(translation);
    } catch (err) {
        // Log the real cause server-side — describeAiError's message is safe
        // to show a user, but shouldn't be the only record of what happened.
        console.error("translateChatMessage failed:", err);
        return actionError(describeAiError(err, "Translation service").message);
    }
}
