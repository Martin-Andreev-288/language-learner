import { type ChatNoteData } from "@/lib/language-chat-note-format";

// One-time hand-off from a saved note back into the chat — same
// sessionStorage-and-read-once shape as parallel-listen-carry.ts and
// inline-listen-carry.ts, so "Continue this conversation" works the same
// way every other "pick up where I left off" action in this app already
// does. Not persisted beyond the one read: as far as the chat page is
// concerned, it's as if this conversation had just been sitting there the
// whole time.
const STORAGE_KEY = "language-chat:carry";

export function writeChatCarry(data: ChatNoteData) {
    if (typeof window === "undefined") return;
    // Map isn't JSON-serializable directly — same entries-array conversion
    // formatChatNote already uses for the same reason.
    window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            language: data.language,
            messages: data.messages,
            feedback: Array.from(data.feedback.entries()),
        }),
    );
}

export function readAndClearChatCarry(): ChatNoteData | null {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STORAGE_KEY);
    try {
        const parsed = JSON.parse(raw);
        if (
            typeof parsed?.language !== "string" ||
            !Array.isArray(parsed.messages) ||
            !Array.isArray(parsed.feedback)
        ) {
            return null;
        }
        return {
            language: parsed.language,
            messages: parsed.messages,
            feedback: new Map(parsed.feedback),
        };
    } catch {
        return null;
    }
}
