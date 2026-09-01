import { NotePage } from "@/app/generated/prisma";

// The two chats this app runs — one written, one spoken — described in one
// place (Question 292), the same way check-tool.tsx describes Writing Check
// and Speak Check.
//
// This exists as its own module rather than living inside the component
// because three unrelated places need to agree about it: the chat itself,
// the two sessionStorage modules that must not mix the conversations up,
// and the notes dashboard, which has to send a resumed conversation back to
// the page it came from.

export type ChatMode = "writing" | "speaking";

export interface ChatModeConfig {
    heading: string;
    description: string;
    // Which notes section a saved conversation is filed under.
    notePage: NotePage;
    // Where "Continue this conversation" sends you from that notes page.
    route: string;
    // Used when the language field is empty, so a saved conversation is
    // never called nothing at all.
    fallbackNoteTitle: string;
    // Prefix for this chat's sessionStorage keys. Distinct per mode, and
    // that is the whole point: with a single shared key, starting a spoken
    // conversation, clicking away and opening the written chat would show
    // you the spoken one — silently, with no error, each chat overwriting
    // the other's draft.
    //
    // The written chat deliberately keeps the original prefix rather than
    // taking a tidier new one, so a conversation already sitting in
    // somebody's open tab survives this change instead of vanishing.
    storagePrefix: string;
    // Whether this chat is spoken rather than written. Carries both
    // halves — the microphone that hears you and the voice that answers —
    // because a chat with one and not the other isn't a thing anyone wants,
    // the same reasoning check-tool.tsx's own flag follows.
    voice: boolean;
}

export const CHAT_MODES: Record<ChatMode, ChatModeConfig> = {
    writing: {
        heading: "Chat",
        description:
            "Practise by having a conversation. Each message you send is checked quietly in the background — the badge beside it opens the feedback when you want it.",
        notePage: NotePage.writing,
        route: "/writing/chat",
        fallbackNoteTitle: "Chat",
        storagePrefix: "language-chat",
        voice: false,
    },
    speaking: {
        heading: "Voice Chat",
        description:
            "Practise by having a conversation out loud. Speak your side of it, and each message is checked quietly in the background — the badge beside it opens the feedback when you want it.",
        notePage: NotePage.speaking,
        route: "/speaking/voice-chat",
        fallbackNoteTitle: "Voice Chat",
        storagePrefix: "voice-chat",
        voice: true,
    },
};

// The notes dashboard knows its section as a plain string and needs to ask
// "is this one of the chats?" — this answers that without it having to
// know which sections happen to have a chat in them.
export function chatModeForPage(page: string): ChatMode | null {
    return page === "writing" || page === "speaking" ? page : null;
}
