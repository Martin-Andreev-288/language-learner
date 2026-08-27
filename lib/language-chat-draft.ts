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

// A reply the user asked to have translated (Question 277). Defined here
// rather than beside FeedbackState because a translation is only ever a
// reading aid on this page — it isn't part of the conversation and never
// goes into a saved note, so this draft is the only thing that persists it.
export type TranslationState =
    | { status: "loading" }
    | { status: "done"; text: string }
    | { status: "error"; message: string };

export interface ChatDraft {
    language: string;
    messages: UIMessage[];
    feedback: Map<string, FeedbackState>;
    // Null until this conversation has been saved to a note — and it has to
    // survive here, or navigating away and back would forget which note a
    // saved conversation belongs to and the next save would create a
    // duplicate (the failure Question 268 built savedNoteId to avoid).
    noteId: string | null;
    // The chosen "Translate into" language, and whatever has been translated
    // so far, keyed by message id. Worth carrying: coming back to a
    // re-picked language field and a row of buttons that each cost an AI
    // call again is exactly the kind of small loss Question 274 set out to
    // stop. Bounded by the conversation itself — only messages that exist
    // can have been translated.
    translateInto: string;
    translations: Map<string, TranslationState>;
}

// An in-flight entry describes a request belonging to a page that no longer
// exists. Restoring one would show a badge pulsing forever, or a button
// stuck on "Translating…", with nothing left running to ever finish it —
// so it's dropped, and the message simply comes back un-checked. (The
// feedback half of this is a bug from Question 274, found while adding the
// translation half.)
//
// A *failed* check is still worth keeping: the badge shows it, and its
// message is right there in the tooltip. A failed translation isn't —
// whether its panel was open isn't persisted, so restoring one would leave
// a button reading "Try again" above nothing that explains why.
function persistedFeedback(
    entries: Map<string, FeedbackState>,
): [string, FeedbackState][] {
    return Array.from(entries.entries()).filter(
        ([, state]) => state.status !== "checking",
    );
}

function persistedTranslations(
    entries: Map<string, TranslationState>,
): [string, TranslationState][] {
    return Array.from(entries.entries()).filter(
        ([, state]) => state.status === "done",
    );
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
                feedback: persistedFeedback(draft.feedback),
                noteId: draft.noteId,
                translateInto: draft.translateInto,
                translations: persistedTranslations(draft.translations),
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
            // Read leniently rather than as required fields, so a draft
            // written before Question 277 still restores its conversation
            // instead of being discarded whole over two missing keys.
            translateInto:
                typeof parsed.translateInto === "string"
                    ? parsed.translateInto
                    : "",
            translations: new Map(
                Array.isArray(parsed.translations) ? parsed.translations : [],
            ),
        };
    } catch {
        return null;
    }
}
