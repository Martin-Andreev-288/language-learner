// Saves an Inline Listen passage as a note, so it can be sent straight back
// into Inline Listen later ("Listen again") — same split and same reasoning
// as lib/parallel-listen-note-format.ts: the note's content is only the
// readable passage, and what's needed to reopen it lives in the note's own
// metadata column rather than hidden in that text (Question 275).
//
// Its own metadata kind rather than reusing Parallel Listen's — a saved
// note still needs to say unambiguously which Listen page can reopen it.

export const INLINE_LISTEN_METADATA_KIND = "inline-listen:v1";

export interface InlineListenNoteData {
    text: string;
    sourceLanguage: string;
}

// The note's visible half. The language is a heading above the passage,
// which reads naturally on its own rather than being a field label.
export function formatInlineListenTranscript(
    data: InlineListenNoteData,
): string {
    const heading = data.sourceLanguage.trim();
    return heading ? `## ${heading}\n\n${data.text}\n` : `${data.text}\n`;
}

export function encodeInlineListenMetadata(data: InlineListenNoteData): string {
    return JSON.stringify({
        text: data.text,
        sourceLanguage: data.sourceLanguage,
    });
}

export function decodeInlineListenMetadata(
    raw: string | null,
): InlineListenNoteData | null {
    if (!raw) return null;
    try {
        const payload = JSON.parse(raw);
        if (typeof payload?.text !== "string") return null;
        return {
            text: payload.text,
            sourceLanguage:
                typeof payload.sourceLanguage === "string"
                    ? payload.sourceLanguage
                    : "",
        };
    } catch {
        return null;
    }
}
