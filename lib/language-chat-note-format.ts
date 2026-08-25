import { type UIMessage } from "ai";

// Message content arrives as an array of parts rather than a plain string —
// only the text ones are of interest here, since this chat has no tools.
// Shared between the chat page (rendering a bubble) and this file (building
// the saved transcript), so there's exactly one definition of "what a
// message's text is".
export function messageText(message: UIMessage) {
    return message.parts
        .filter(
            (part): part is { type: "text"; text: string } =>
                part.type === "text",
        )
        .map((part) => part.text)
        .join("");
}

export interface Correction {
    original: string;
    corrected: string;
    explanation: string;
}

export type FeedbackState =
    | { status: "checking" }
    | { status: "done"; corrections: Correction[] }
    | { status: "error"; message: string };

export interface ChatNoteData {
    language: string;
    messages: UIMessage[];
    feedback: Map<string, FeedbackState>;
}

// Names this metadata format, so the notes list can tell a resumable chat
// note from any other kind without reading the payload.
export const CHAT_METADATA_KIND = "language-chat:v1";

// The note's visible half: plain Markdown meant only to be read. It is
// never parsed back — everything resuming needs lives in the note's
// metadata column instead (Question 266), so this is free to be as
// human-shaped as it likes without a format to preserve.
//
// Corrections sit right under the message they belong to, in the same
// struck-through/corrected/explanation shape the chat itself shows, rather
// than collected into a separate list at the end.
export function formatChatTranscript(data: ChatNoteData): string {
    const title = data.language.trim() || "Chat";
    const turns = data.messages.map((message) => {
        const speaker = message.role === "user" ? "You" : `${title} partner`;
        let block = `**${speaker}:** ${messageText(message)}`;

        const state = data.feedback.get(message.id);
        if (message.role === "user" && state?.status === "done") {
            const corrections = state.corrections
                .map(
                    (correction) =>
                        `> ~~${correction.original}~~ → **${correction.corrected}**\n>\n> ${correction.explanation}`,
                )
                .join("\n>\n");
            if (corrections) block += `\n\n${corrections}`;
        }

        return block;
    });

    return `${turns.join("\n\n---\n\n")}\n`;
}

// The note's hidden half: exactly what "Continue this conversation" needs to
// restore the chat, stored in the note's own metadata column rather than
// smuggled into its text. Plain JSON — no base64 or escaping needed now
// that it doesn't have to survive being embedded in Markdown.
export function encodeChatMetadata(data: ChatNoteData): string {
    return JSON.stringify({
        language: data.language,
        messages: data.messages,
        // A Map isn't JSON-serializable directly.
        feedback: Array.from(data.feedback.entries()),
    });
}

export function decodeChatMetadata(raw: string | null): ChatNoteData | null {
    if (!raw) return null;
    try {
        const payload = JSON.parse(raw);
        if (
            typeof payload?.language !== "string" ||
            !Array.isArray(payload.messages) ||
            !Array.isArray(payload.feedback)
        ) {
            return null;
        }
        return {
            language: payload.language,
            messages: payload.messages,
            feedback: new Map(payload.feedback),
        };
    } catch {
        return null;
    }
}
