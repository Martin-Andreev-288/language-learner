import { type UIMessage } from "ai";
import { type FeedbackState } from "@/lib/language-chat-note-format";
import { CHAT_MODES, type ChatMode } from "@/lib/language-chat-mode";

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

// Keyed per chat rather than one shared key (Question 292). Two chats
// sharing one draft would silently show each other's conversations — see
// lib/language-chat-mode.ts's storagePrefix for the full reasoning.
function storageKey(mode: ChatMode) {
    return `${CHAT_MODES[mode].storagePrefix}:draft`;
}

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
    // The voice chat's two switches. Worth carrying for the same reason the
    // translation language is: turning the voice off because you're
    // somewhere quiet, then having it come back on by itself after clicking
    // away and back, is exactly the small betrayal Question 274 set out to
    // stop. Ignored entirely by the written chat.
    speakReplies: boolean;
    autoSend: boolean;
    speechRate: number;
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

export function writeChatDraft(mode: ChatMode, draft: ChatDraft) {
    if (typeof window === "undefined") return;

    // A conversation is much larger than the pasted passages the other
    // drafts hold, and sessionStorage has a per-origin quota of a few MB.
    // Exceeding it throws, and an unhandled throw here would surface as the
    // page breaking mid-conversation — so a full store degrades to simply
    // not persisting, which costs the user nothing they had a moment ago.
    try {
        window.sessionStorage.setItem(
            storageKey(mode),
            JSON.stringify({
                language: draft.language,
                messages: draft.messages,
                // Map isn't JSON-serializable directly.
                feedback: persistedFeedback(draft.feedback),
                noteId: draft.noteId,
                translateInto: draft.translateInto,
                translations: persistedTranslations(draft.translations),
                speakReplies: draft.speakReplies,
                autoSend: draft.autoSend,
                speechRate: draft.speechRate,
            }),
        );
    } catch {
        // Quota exceeded, or storage unavailable (private browsing). Both
        // mean "this conversation won't survive a navigation", which is
        // worth silently accepting rather than interrupting the chat over.
    }
}

export function clearChatDraft(mode: ChatMode) {
    if (typeof window === "undefined") return;
    try {
        window.sessionStorage.removeItem(storageKey(mode));
    } catch {
        // Nothing useful to do if storage is unavailable.
    }
}

export function readChatDraft(mode: ChatMode): ChatDraft | null {
    if (typeof window === "undefined") return null;
    let raw: string | null = null;
    try {
        raw = window.sessionStorage.getItem(storageKey(mode));
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
            // Read leniently, like the two fields above: a draft written
            // before this existed should restore its conversation rather
            // than be thrown away over a missing switch. Speaking defaults
            // on — it's what the page is for — and auto-send defaults off,
            // so nothing sends itself unless you asked it to.
            speakReplies:
                typeof parsed.speakReplies === "boolean"
                    ? parsed.speakReplies
                    : true,
            autoSend: parsed.autoSend === true,
            // Guarded rather than trusted: a nonsense value out of storage
            // would be handed straight to the browser's speech engine.
            speechRate:
                typeof parsed.speechRate === "number" &&
                parsed.speechRate > 0 &&
                parsed.speechRate <= 3
                    ? parsed.speechRate
                    : 1,
        };
    } catch {
        return null;
    }
}
