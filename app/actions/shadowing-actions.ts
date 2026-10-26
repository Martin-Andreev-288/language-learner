"use server";

import { auth } from "@/auth";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { describeAiError } from "@/lib/ai-error";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
    SHADOWING_ATTEMPT_MAX_CHARACTERS,
    SHADOWING_TOPIC_MAX_CHARACTERS,
} from "@/lib/limits";
import {
    isWordPerfect,
    SHADOWING_CHECK_CAVEAT,
    type ShadowingCheck,
} from "@/lib/shadowing-check";
import { splitIntoSentences } from "@/lib/sentence-split";
import {
    cleanSoundsCheck,
    soundsPrompt,
    soundsSchema,
    soundsUploadProblem,
    type SoundsCheck,
} from "@/lib/shadowing-sounds";
import {
    DEFAULT_SHADOWING_LENGTH,
    DEFAULT_SHADOWING_REGISTER,
    DEFAULT_SHADOWING_SENTENCE_LENGTH,
    SHADOWING_LENGTHS,
    SHADOWING_REGISTER_PROMPTS,
    SHADOWING_REGISTERS,
    SHADOWING_SENTENCE_LENGTHS,
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
            `That's ${topic.length} characters — please keep the topic or notes under ${SHADOWING_TOPIC_MAX_CHARACTERS}.`,
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

    const sentenceLength =
        SHADOWING_SENTENCE_LENGTHS.find(
            (item) => item.value === options.sentenceLength,
        ) ??
        SHADOWING_SENTENCE_LENGTHS.find(
            (item) => item.value === DEFAULT_SHADOWING_SENTENCE_LENGTH,
        )!;

    // Each optional field contributes a line or contributes nothing. An
    // empty field says "no direction here" — the alternative, writing
    // "Topic: any", spends words telling the model to ignore something it
    // was never told in the first place.
    const directions = [
        language
            ? `Write it in ${language}.`
            : "Choose a language yourself — any language a learner might reasonably be studying.",
        level ? `Pitch it at CEFR level ${level}.` : null,
        // Deliberately not labelled "Topic", because the field no longer is
        // one (Question 372). Saying "topic or instruction" is what lets
        // "use lots of past tense" be read as a direction rather than as a
        // subject to write a passage *about*.
        topic ? `Topic or instruction from the learner: ${topic}` : null,
        `Style: ${SHADOWING_REGISTER_PROMPTS[register] ?? register}.`,
        `Length: about ${length.sentences} sentences in total.`,
        `Keep most sentences to about ${sentenceLength.words} words each — this is read back out loud one sentence at a time, so a sentence longer than a breath is one nobody can repeat.`,
    ]
        .filter(Boolean)
        .join("\n");

    let output: GeneratedPassage;
    try {
        const result = await generateText({
            model: google("gemini-3.5-flash-lite"),
            // Structured rather than plain text, and not for the usual
            // reason: one field would be no harder to parse than a bare
            // string, but a bare string tends to arrive wearing "Here's a
            // passage for you:" in front of it. A schema gets the passage
            // by itself, with nothing to strip off afterwards.
            output: Output.object({
                schema: z.object({
                    passage: z
                        .string()
                        .describe(
                            "The passage itself, and nothing else, with each sentence on its own line.",
                        ),
                    language: z
                        .string()
                        .describe(
                            "The language the passage is written in, as an English name such as German or Bulgarian.",
                        ),
                }),
            }),
            prompt: `Write a short passage for a language learner to practise shadowing — listening to one sentence at a time and repeating it out loud.

${directions}

Put each sentence on its own line. It will be split into sentences and spoken aloud one at a time by a speech synthesiser, so:
- One sentence per line, with no blank lines between them.
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

    // One sentence per line, made true rather than asked for (Question 372).
    //
    // The prompt asks, and a model mostly complies, but "mostly" is the
    // wrong guarantee here: a line break is the one thing the splitter
    // treats as an unconditional boundary, so a generated passage that
    // arrives one-per-line can't be mis-split by an abbreviation or an
    // initial the list doesn't know. Running it through the same splitter
    // the page will use makes that certain — and when the model did comply,
    // the splitter sees the line breaks it already has and changes nothing.
    //
    // What this costs is paragraph breaks, which a passage read one
    // sentence at a time was never showing anyway.
    const lines = splitIntoSentences(passage);

    return actionOk({
        passage: lines.length > 0 ? lines.join("\n") : passage,
        // What was asked for wins over what was reported: the language field
        // is what picks the voice, and quietly rewriting a choice you made
        // would be worse than trusting it. The reported one only fills the
        // gap when you left it open.
        language: language || output.language?.trim() || "",
    });
}


// --- the record-and-check loop -------------------------------------------

const differenceSchema = z.object({
    expected: z
        .string()
        .describe(
            "The word or short phrase from the target sentence — just that part, not the sentence around it.",
        ),
    heard: z
        .string()
        .describe(
            "What was said instead. An empty string when the word was left out altogether — genuinely empty, not a placeholder such as [missing] or (nothing); the page supplies its own wording for that.",
        ),
    note: z
        .string()
        .describe(
            "One short line for the learner: what the difference is, or that it is probably the recogniser mishearing rather than a mistake they made.",
        ),
});

// How long either half of an attempt's check may take before it gives up
// (item 10, iteration 4). Both usually answer in a few seconds; without a
// limit, a request that hangs leaves the page on "Checking what you said…"
// until the host ends the request. Twenty seconds is several times the
// usual wait, and short enough that "Try again" comes while you still care.
const CHECK_TIMEOUT_MS = 20_000;

const attemptSchema = z.object({
    verdict: z
        .enum(["match", "close", "off"])
        .describe(
            "match when the words are the same, close when a word or two drifted, off when a good part of the sentence is missing or different.",
        ),
    summary: z
        .string()
        .describe(
            "One short sentence addressed to the learner, saying how it went. No greeting, no praise padding.",
        ),
    differences: z.array(differenceSchema),
});

// Compares a spoken attempt against the sentence being shadowed
// (Question 373).
//
// The first AI call in this app that compares two pieces of text rather than
// transforming one — translate, check, enrich and look up all take a single
// input and do something to it. Worth naming because it changes what a bad
// answer looks like: there is a correct answer here sitting right next to
// the input, so a wrong finding is checkable in a way a wrong translation
// isn't.
//
// What it does *not* do is judge pronunciation, and the prompt says so as
// plainly as the page does. The browser hands back words, never sounds.
//
// Returns failures rather than throwing them, so the message survives a
// production build — see lib/action-result.ts.
export async function checkShadowingAttempt(
    target: string,
    attempt: string,
    language?: string,
): Promise<ActionResult<ShadowingCheck>> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const trimmedTarget = target.trim();
    const trimmedAttempt = attempt.trim();

    if (!trimmedTarget) {
        return actionError("There's no sentence to compare against.");
    }
    if (!trimmedAttempt) {
        return actionError("Nothing was heard — try recording again.");
    }
    if (trimmedAttempt.length > SHADOWING_ATTEMPT_MAX_CHARACTERS) {
        return actionError(
            `That attempt is ${trimmedAttempt.length} characters — one sentence at a time, please.`,
        );
    }

    // The page checks this first and never gets here when it holds, so this
    // is a guard rather than the main path: it costs one string comparison
    // and means a word-perfect attempt can't spend a request even if it
    // arrives from somewhere that forgot to look.
    if (isWordPerfect(trimmedTarget, trimmedAttempt)) {
        return actionOk({
            verdict: "match",
            summary: "Every word of the sentence was understood.",
            differences: [],
        });
    }

    const trimmedLanguage = language?.trim();
    const languageLine = trimmedLanguage
        ? `The sentence is in ${trimmedLanguage}, and the attempt was meant to be too. Judge it as ${trimmedLanguage}.\n\n`
        : "";

    let output: ShadowingCheck;
    try {
        const result = await generateText({
            model: google("gemini-3.5-flash-lite"),
            abortSignal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
            output: Output.object({ schema: attemptSchema }),
            prompt: `${languageLine}Someone learning a language is shadowing: they listened to one sentence and repeated it out loud. Their attempt was captured by the browser's speech recognition, so it reaches you as text.

Compare what was heard against the sentence they were repeating.

${SHADOWING_CHECK_CAVEAT} Bear that in mind throughout — never comment on accent, stress, intonation or pronunciation, because none of that survives in the text you were given.

Rules for what counts as a difference:
- Ignore punctuation and capitalisation completely. Neither can be spoken aloud, and the recogniser supplies both by itself.
- Ignore differences that are only about spelling out numbers, dates or currency — "20" and "twenty" are the same spoken word.
- Speech recognition mishears. When a difference looks like the recogniser's fault rather than the speaker's — a homophone, one word split into two, a name transcribed oddly — report it, but say in the note that it is probably a mishearing rather than a mistake they made.
- Report only the specific word or short phrase that differs, not the whole sentence around it.
- If nothing meaningful differs, return an empty list of differences and the "match" verdict.

Write the summary to the learner directly, as "you" — not as "the user" or "the speaker".

Do not invent differences to have something to report, and do not rewrite the sentence for them.

The sentence they were shadowing:
"""
${trimmedTarget}
"""

What was heard:
"""
${trimmedAttempt}
"""`,
        });
        output = result.output;
    } catch (err) {
        console.error("checkShadowingAttempt failed:", err);
        return actionError(describeAiError(err, "Attempt check").message);
    }

    return actionOk(output);
}

// Checks the *sounds* of one spoken attempt (item 10 in directions2.md): the
// recording itself goes to the model, not the words the browser made of it,
// because those words have already been corrected — "mude" arrives as
// "müde". What it can and can't tell you is set out in
// lib/shadowing-sounds.ts.
//
// The same small model as everything else in this app: the tests behind
// this feature found it the only one that never reported a wrong sound in
// correct speech, which matters more here than catching every mistake.
//
// Takes FormData because a recording is binary: up to about 384 KB of WAV,
// which a server action accepts within its 1 MB limit. Nothing is kept —
// the sound is read, sent on, and dropped when the request ends.
//
// Returns failures rather than throwing them, so the message survives a
// production build — see lib/action-result.ts.
export async function checkShadowingSounds(
    form: FormData,
): Promise<ActionResult<SoundsCheck>> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const audio = form.get("audio");
    const sentence = String(form.get("sentence") ?? "").trim();
    const language = String(form.get("language") ?? "").trim();
    if (!(audio instanceof Blob)) {
        return actionError("Nothing was recorded — try recording again.");
    }

    const bytes = new Uint8Array(await audio.arrayBuffer());
    const problem = soundsUploadProblem({ bytes, sentence });
    if (problem) return actionError(problem);

    try {
        const result = await generateText({
            model: google("gemini-3.5-flash-lite"),
            abortSignal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
            output: Output.object({ schema: soundsSchema }),
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: soundsPrompt(sentence, language) },
                        { type: "file", data: bytes, mediaType: "audio/wav" },
                    ],
                },
            ],
        });
        return actionOk(cleanSoundsCheck(result.output));
    } catch (err) {
        console.error("checkShadowingSounds failed:", err);
        return actionError(describeAiError(err, "Sounds check").message);
    }
}
