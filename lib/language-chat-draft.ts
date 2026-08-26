import { type UIMessage } from "ai";
import { type FeedbackState } from "@/lib/language-chat-note-format";

// Keeps an in-progress conversation alive across a page navigation, so
// clicking away and coming back doesn't lose it (Question 274) — the same
// idea as lib/inline-translate-draft.ts, and sessionStorage for the same
// reason: gone once the tab closes, which is exactly "for a while, not
// necessarily forever".
//
// Distinct from lib/language-chat-carry.ts despite the similar shape. The
// carry is a one-time, read-and-clear hand-off *from a note into* the chat;
// this is the chat's own running draft of itself, rewritten as the
// conversation grows and read back whenever the page is opened again.
const STORAGE_KEY = "language-chat:draft";

export interface ChatDraft {
    language: string;
    messages: UIMessage[];
    feedback: Map<string, FeedbackState>;
    // Null until this conversation has been saved to a note — and it has to
    // survive here, or navigating away and back would forget which note a
    // saved conversation belongs to and the next save would create a
    // duplicate (the failure Question 268 built savedNoteId to avoid).
    noteId: string | null;
}

export function writeChatDraft(draft: ChatDraft) {
    if (typeof window === "undefined") return;

    // A conversation is much larger than the pasted passages the other
    // drafts hold, and sessionStorage has a per-origin quota of a few MB.
    // Exceeding it throws, and an unhandled throw here would surface as the
    // page breaking mid-conversation — so a full store degrades to simply
    // not persisting, which costs the user nothing they had a moment ago.
    try {
        window.sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                language: draft.language,
                messages: draft.messages,
                // Map isn't JSON-serializable directly.
                feedback: Array.from(draft.feedback.entries()),
                noteId: draft.noteId,
            }),
        );
    } catch {
        // Quota exceeded, or storage unavailable (private browsing). Both
        // mean "this conversation won't survive a navigation", which is
        // worth silently accepting rather than interrupting the chat over.
    }
}

export function clearChatDraft() {
    if (typeof window === "undefined") return;
    try {
        window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing useful to do if storage is unavailable.
    }
}

export function readChatDraft(): ChatDraft | null {
    if (typeof window === "undefined") return null;
    let raw: string | null = null;
    try {
        raw = window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
    if (!raw) return null;

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
            noteId:
                typeof parsed.noteId === "string" ? parsed.noteId : null,
        };
    } catch {
        return null;
    }
}
