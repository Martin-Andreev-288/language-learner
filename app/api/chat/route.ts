import { auth } from "@/auth";
import { google } from "@ai-sdk/google";
import {
    convertToModelMessages,
    createUIMessageStreamResponse,
    streamText,
    toUIMessageStream,
    type UIMessage,
} from "ai";

// This app's first Route Handler — every other AI feature is a Server
// Action, but a Server Action can't return a streaming Response, and a chat
// that waits for the whole reply before showing anything would feel far
// worse than the tools that legitimately do work that way. Same `ai` and
// `@ai-sdk/google` packages underneath as everywhere else; only the
// transport is different.
export const maxDuration = 30;

const MAX_MESSAGES = 100;

function buildSystemPrompt(language: string) {
    const trimmed = language.trim();
    // No language given yet is a normal state, not an error — the field is
    // optional to start with, so the model just picks it up from whatever
    // the user writes rather than refusing to talk.
    const languageLine = trimmed
        ? `Always reply in ${trimmed}, whatever language the learner writes in — they are here to practise ${trimmed}.`
        : `Reply in whatever language the learner is writing in.`;

    return `You are a friendly conversation partner for someone practising a foreign language by chatting.

${languageLine}

Keep replies short — two or three sentences is usually right, since this is a conversation, not a lecture. Sound like a person talking, not like documentation: no headings, no bullet lists, no markdown formatting.

Stay in the conversation. Do not correct the learner's mistakes, do not comment on their grammar, and do not switch into teacher mode even if they make errors — mistakes are handled separately elsewhere in this app, and interrupting the conversation to point them out is exactly what this chat is meant not to do.

End most replies with a question or something to react to, so the conversation keeps moving without the learner having to restart it every turn.`;
}

export async function POST(req: Request) {
    // Same auth gate every Server Action in this app uses — a Route Handler
    // is a public URL, so this isn't optional just because the page around
    // it is already behind AuthPrompt.
    const session = await auth();
    if (!session?.user?.id) {
        return new Response("Unauthorized", { status: 401 });
    }

    let body: { messages?: UIMessage[]; language?: string };
    try {
        body = await req.json();
    } catch {
        return new Response("Invalid request body", { status: 400 });
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
        return new Response("No messages to reply to", { status: 400 });
    }
    if (messages.length > MAX_MESSAGES) {
        return new Response(
            `That conversation is too long — start a new one.`,
            { status: 400 },
        );
    }

    const result = streamText({
        model: google("gemini-3.5-flash-lite"),
        system: buildSystemPrompt(body.language ?? ""),
        messages: await convertToModelMessages(messages),
    });

    // `result.toUIMessageStreamResponse()` still works, but it's marked
    // deprecated in the `ai` package and is slated for removal in the next
    // major — these two standalone helpers are its documented replacement,
    // and produce the identical wire format the client already expects.
    return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: result.stream }),
    });
}