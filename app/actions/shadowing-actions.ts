"use server";

import { auth } from "@/auth";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { SHADOWING_TOPIC_MAX_CHARACTERS } from "@/lib/limits";
import {
    DEFAULT_SHADOWING_LENGTH,
    DEFAULT_SHADOWING_REGISTER,
    SHADOWING_LENGTHS,
    SHADOWING_REGISTER_PROMPTS,
    SHADOWING_REGISTERS,
    type GeneratedPassage,
    type ShadowingGenerationOptions,
} from "@/lib/shadowing-generation";

// Writes a passage to shadow (Question 363).
//
// The first thing in this app that generates content rather than working on
// content you already had — every other AI call here translates, checks,
// enriches or looks up something you supplied. Worth naming, because it
// changes what "wrong output" means: a bad translation is visibly wrong
// against its source, while a bad passage is just a passage. That's the
// reason the result lands in the editable box rather than going straight
// into practice.
//
// Returns failures rather than throwing them, so the message survives a
// production build — see lib/action-result.ts.
export async function generateShadowingPassage(
    options: ShadowingGenerationOptions,
): Promise<ActionResult<GeneratedPassage>> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const language = options.language?.trim() ?? "";
    const level = options.level?.trim() ?? "";
    const topic = options.topic?.trim() ?? "";

    if (topic.length > SHADOWING_TOPIC_MAX_CHARACTERS) {
        return actionError(
            `That topic is ${topic.length} characters — please keep it under ${SHADOWING_TOPIC_MAX_CHARACTERS}.`,
        );
    }

    // Falls back rather than rejecting: an unrecognised value here means a
    // stale form, not a user who needs telling off, and the defaults are
    // exactly what an untouched form would have sent anyway.
    const register = (SHADOWING_REGISTERS as readonly string[]).includes(
        options.register ?? "",
    )
        ? (options.register as string)
        : DEFAULT_SHADOWING_REGISTER;

    const length =
        SHADOWING_LENGTHS.find((item) => item.value === options.length) ??
        SHADOWING_LENGTHS.find((item) => item.value === DEFAULT_SHADOWING_LENGTH)!;

    // Each optional field contributes a line or contributes nothing. An
    // empty field says "no direction here" — the alternative, writing
    // "Topic: any", spends words telling the model to ignore something it
    // was never told in the first place.
    const directions = [
        language
            ? `Write it in ${language}.`
            : "Choose a language yourself — any language a learner might reasonably be studying.",
        level ? `Pitch it at CEFR level ${level}.` : null,
        topic ? `It should be about: ${topic}.` : null,
        `Style: ${SHADOWING_REGISTER_PROMPTS[register] ?? register}.`,
        `Length: about ${length.sentences} sentences.`,
    ]
        .filter(Boolean)
        .join("\n");

    let output: GeneratedPassage;
    try {
        const result = await generateText({
            model: google("gemini-3.6-flash"),
            // Structured rather than plain text, and not for the usual
            // reason: one field would be no harder to parse than a bare
            // string, but a bare string tends to arrive wearing "Here's a
            // passage for you:" in front of it. A schema gets the passage
            // by itself, with nothing to strip off afterwards.
            output: Output.object({
                schema: z.object({
                    passage: z
                        .string()
                        .describe("The passage itself, and nothing else."),
                    language: z
                        .string()
                        .describe(
                            "The language the passage is written in, as an English name such as German or Bulgarian.",
                        ),
                }),
            }),
            prompt: `Write a short passage for a language learner to practise shadowing — listening to one sentence at a time and repeating it out loud.

${directions}

Write it as ordinary sentences of flowing text. It will be split into sentences and spoken aloud one at a time by a speech synthesiser, so:
- No headings, no bullet points, no numbering, and no stage directions.
- No speaker labels like "A:" or "Interviewer:" even when the style is a conversation — write the turns as ordinary sentences.
- Nothing in brackets, and no notes to the reader.

Also report which language you wrote it in.`,
        });
        output = result.output;
    } catch (err) {
        console.error("generateShadowingPassage failed:", err);
        return actionError(describeAiError(err, "Passage generation").message);
    }

    const passage = output.passage?.trim() ?? "";
    if (!passage) {
        return actionError("That came back empty — try generating again.");
    }

    return actionOk({
        passage,
        // What was asked for wins over what was reported: the language field
        // is what picks the voice, and quietly rewriting a choice you made
        // would be worse than trusting it. The reported one only fills the
        // gap when you left it open.
        language: language || output.language?.trim() || "",
    });
}
