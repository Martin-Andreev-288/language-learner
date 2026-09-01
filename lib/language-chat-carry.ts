import { type ChatNoteData } from "@/lib/language-chat-note-format";
import { CHAT_MODES, type ChatMode } from "@/lib/language-chat-mode";

// One-time hand-off from a saved note back into the chat — same
// sessionStorage-and-read-once shape as parallel-listen-carry.ts and
// inline-listen-carry.ts, so "Continue this conversation" works the same
// way every other "pick up where I left off" action in this app already
// does. Not persisted beyond the one read: as far as the chat page is
// concerned, it's as if this conversation had just been sitting there the
// whole time.

// Keyed per chat for the same reason the draft is (Question 292): a carry
// written from the Writing notes page must not be picked up by the voice
// chat, or "Continue this conversation" would open the wrong conversation
// on the wrong page.
function storageKey(mode: ChatMode) {
    return `${CHAT_MODES[mode].storagePrefix}:carry`;
}

export interface ChatCarry extends ChatNoteData {
    // Which note this conversation came out of, so saving after resuming
    // keeps that same note current instead of spawning a second copy of the
    // same conversation (Question 268). Not part of ChatNoteData itself —
    // a note has no reason to store its own id inside its own metadata.
    noteId: string;
}

export function writeChatCarry(mode: ChatMode, carry: ChatCarry) {
    if (typeof window === "undefined") return;
    // Map isn't JSON-serializable directly — same entries-array conversion
    // the note metadata already uses for the same reason.
    window.sessionStorage.setItem(
        storageKey(mode),
        JSON.stringify({
            noteId: carry.noteId,
            language: carry.language,
            messages: carry.messages,
            feedback: Array.from(carry.feedback.entries()),
        }),
    );
}

export function readAndClearChatCarry(mode: ChatMode): ChatCarry | null {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(storageKey(mode));
    if (!raw) return null;
    window.sessionStorage.removeItem(storageKey(mode));
    try {
        const parsed = JSON.parse(raw);
        if (
            typeof parsed?.noteId !== "string" ||
            typeof parsed?.language !== "string" ||
            !Array.isArray(parsed.messages) ||
            !Array.isArray(parsed.feedback)
        ) {
            return null;
        }
        return {
            noteId: parsed.noteId,
            language: parsed.language,
            messages: parsed.messages,
            feedback: new Map(parsed.feedback),
        };
    } catch {
        return null;
    }
}
