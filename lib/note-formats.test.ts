import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import {
    CHAT_METADATA_KIND,
    decodeChatMetadata,
    encodeChatMetadata,
    formatChatTranscript,
    messageText,
    type ChatNoteData,
    type FeedbackState,
} from "./language-chat-note-format";
import {
    PARALLEL_LISTEN_METADATA_KIND,
    decodeParallelListenMetadata,
    encodeParallelListenMetadata,
    formatParallelListenTranscript,
} from "./parallel-listen-note-format";
import {
    INLINE_LISTEN_METADATA_KIND,
    decodeInlineListenMetadata,
    encodeInlineListenMetadata,
    formatInlineListenTranscript,
} from "./inline-listen-note-format";
import {
    SHADOWING_METADATA_KIND,
    decodeShadowingMetadata,
    encodeShadowingMetadata,
    formatShadowingTranscript,
} from "./shadowing-note-format";

// A saved note is written by one version of the app and read back by every
// later one. The metadata half is what "Listen again", "Practice again" and
// "Continue this conversation" reopen from, so the two things worth pinning
// are that it survives the trip, and that anything else — an old note, an
// edited one, a corrupted one — comes back as null rather than a throw that
// takes the notes page down with it.

const userMessage = (id: string, text: string): UIMessage => ({
    id,
    role: "user",
    parts: [{ type: "text", text }],
});

const partnerMessage = (id: string, text: string): UIMessage => ({
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
});

const chat: ChatNoteData = {
    language: "German",
    messages: [
        userMessage("m1", "Ich habe gestern Kino gegangen."),
        partnerMessage("m2", "Was hast du gesehen?"),
        userMessage("m3", "Einen Film über Berlin."),
    ],
    feedback: new Map<string, FeedbackState>([
        [
            "m1",
            {
                status: "done",
                corrections: [
                    {
                        original: "habe gestern Kino gegangen",
                        corrected: "bin gestern ins Kino gegangen",
                        explanation: "gehen takes sein in the perfect tense.",
                    },
                ],
            },
        ],
        ["m3", { status: "error", message: "The check failed — try again." }],
    ]),
};

const columns = [
    { name: "German", text: "Guten Morgen. Wie geht's?" },
    { name: "English", text: "Good morning. How are you?" },
];

const inlineListen = {
    text: "Ich **lerne** (*am learning*) Deutsch.",
    sourceLanguage: "German",
};

const shadowing = { text: "Das ist ein Satz. Und noch einer.", language: "German" };

// Saved notes record which format they hold in the database, under these
// exact strings. Unlike most constants (Answer 4), these are not free to
// change: renaming one leaves every note saved under the old name unable to
// reopen.
describe("the metadata kinds", () => {
    it("keep the exact names already stored in saved notes", () => {
        expect(CHAT_METADATA_KIND).toBe("language-chat:v1");
        expect(PARALLEL_LISTEN_METADATA_KIND).toBe("parallel-listen:v1");
        expect(INLINE_LISTEN_METADATA_KIND).toBe("inline-listen:v1");
        expect(SHADOWING_METADATA_KIND).toBe("shadowing:v1");
    });
});

describe("every decoder", () => {
    const decoders = [
        ["chat", decodeChatMetadata],
        ["parallel listen", decodeParallelListenMetadata],
        ["inline listen", decodeInlineListenMetadata],
        ["shadowing", decodeShadowingMetadata],
    ] as const;

    // A note saved before metadata existed has none, and the rest are what a
    // hand-edited or half-written column could plausibly hold.
    it.each(decoders)("%s returns null for anything that isn't its format", (_name, decode) => {
        for (const raw of [null, "", "not json", "{", "null", "42", '"text"', "[]", "{}"]) {
            expect(decode(raw)).toBeNull();
        }
    });
});

describe("chat notes", () => {
    it("come back exactly as saved, feedback included", () => {
        expect(decodeChatMetadata(encodeChatMetadata(chat))).toEqual(chat);
    });

    it("are rejected when a required part is missing", () => {
        const { language, messages } = chat;
        expect(decodeChatMetadata(JSON.stringify({ language, messages }))).toBeNull();
        expect(
            decodeChatMetadata(JSON.stringify({ messages, feedback: [] })),
        ).toBeNull();
        expect(
            decodeChatMetadata(JSON.stringify({ language, messages: "hi", feedback: [] })),
        ).toBeNull();
    });

    it("read as a transcript with each correction under its own message", () => {
        expect(formatChatTranscript(chat)).toBe(
            [
                "**You:** Ich habe gestern Kino gegangen.",
                "",
                "> ~~habe gestern Kino gegangen~~ → **bin gestern ins Kino gegangen**",
                ">",
                "> gehen takes sein in the perfect tense.",
                "",
                "---",
                "",
                "**German partner:** Was hast du gesehen?",
                "",
                "---",
                "",
                "**You:** Einen Film über Berlin.",
                "",
            ].join("\n"),
        );
    });

    it("fall back to a plain partner label when there is no language", () => {
        const transcript = formatChatTranscript({
            language: "  ",
            messages: [partnerMessage("m1", "Hallo!")],
            feedback: new Map(),
        });
        expect(transcript).toBe("**Chat partner:** Hallo!\n");
    });

    it("take only the text parts of a message", () => {
        const message = {
            id: "m1",
            role: "assistant",
            parts: [
                { type: "step-start" },
                { type: "text", text: "Hallo, " },
                { type: "text", text: "wie geht's?" },
            ],
        } as UIMessage;
        expect(messageText(message)).toBe("Hallo, wie geht's?");
    });
});

describe("parallel listen notes", () => {
    it("come back exactly as saved", () => {
        expect(
            decodeParallelListenMetadata(encodeParallelListenMetadata(columns)),
        ).toEqual(columns);
    });

    it("drop a malformed column and keep the rest", () => {
        const raw = JSON.stringify({
            columns: [columns[0], { name: "French" }, { text: "Bonjour" }, null],
        });
        expect(decodeParallelListenMetadata(raw)).toEqual([columns[0]]);
    });

    it("are rejected when no column survives", () => {
        expect(decodeParallelListenMetadata(JSON.stringify({ columns: [] }))).toBeNull();
        expect(
            decodeParallelListenMetadata(JSON.stringify({ columns: [{ name: "x" }] })),
        ).toBeNull();
    });

    it("read as one heading per language, untitled and empty columns included", () => {
        expect(
            formatParallelListenTranscript([
                columns[0],
                { name: " ", text: "Ohne Namen" },
                { name: "French", text: "" },
            ]),
        ).toBe(
            "## German\n\nGuten Morgen. Wie geht's?\n\n## Untitled\n\nOhne Namen\n\n## French\n",
        );
    });
});

// Inline Listen and Shadowing save the same shape — a passage and its
// language — so they share one set of checks.
function describePassageFormat<D extends { text: string }>(
    name: string,
    data: D,
    languageKey: Exclude<keyof D, "text"> & string,
    encode: (data: D) => string,
    decode: (raw: string | null) => D | null,
    format: (data: D) => string,
) {
    describe(name, () => {
        it("come back exactly as saved", () => {
            expect(decode(encode(data))).toEqual(data);
        });

        // The passage is the part worth reopening; a missing language only
        // means the picker starts empty, so the note still opens.
        it("still open when the language is missing", () => {
            expect(decode(JSON.stringify({ text: data.text }))).toEqual({
                text: data.text,
                [languageKey]: "",
            });
        });

        it("are rejected without a passage", () => {
            expect(decode(JSON.stringify({ [languageKey]: "German" }))).toBeNull();
        });

        it("read as the passage under a language heading, or alone without one", () => {
            expect(format(data)).toBe(`## German\n\n${data.text}\n`);
            expect(format({ ...data, [languageKey]: " " })).toBe(`${data.text}\n`);
        });
    });
}

describePassageFormat(
    "inline listen notes",
    inlineListen,
    "sourceLanguage",
    encodeInlineListenMetadata,
    decodeInlineListenMetadata,
    formatInlineListenTranscript,
);

describePassageFormat(
    "shadowing notes",
    shadowing,
    "language",
    encodeShadowingMetadata,
    decodeShadowingMetadata,
    formatShadowingTranscript,
);

// The notes page tells three of these formats apart by asking each decoder
// in turn — parallel listen, then inline listen, then chat — and taking the
// first that accepts the payload. That only works while each decoder turns
// down the payloads of the formats probed after it. (Shadowing is matched
// on its stored kind instead, because the inline listen decoder would
// accept a shadowing payload: both carry a `text`.)
describe("telling the formats apart on the notes page", () => {
    it("never mistakes inline listen or chat notes for parallel listen ones", () => {
        expect(decodeParallelListenMetadata(encodeInlineListenMetadata(inlineListen))).toBeNull();
        expect(decodeParallelListenMetadata(encodeChatMetadata(chat))).toBeNull();
    });

    it("never mistakes a chat note for an inline listen one", () => {
        expect(decodeInlineListenMetadata(encodeChatMetadata(chat))).toBeNull();
    });
});
