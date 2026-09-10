// Saves a Shadowing passage as a note, so it can be sent straight back into
// Shadowing later ("Practice again") — the same split, and the same
// reasoning, as lib/inline-listen-note-format.ts: the note's content is only
// the readable passage, and what's needed to reopen it lives in the note's
// own metadata column rather than hidden inside that text (Question 275).
//
// That split matters more here than it looks. The note is editable like any
// other, and a passage you tidy up by hand should still reopen — reading the
// passage back out of prose you'd been free to reformat is exactly the
// fragility the metadata column exists to avoid.
//
// Its own metadata kind rather than reusing a Listen page's: a saved note has
// to say unambiguously which page can reopen it, and Shadowing is filed under
// Speaking notes alongside saved conversations, which resume somewhere else
// entirely (Question 360).

export const SHADOWING_METADATA_KIND = "shadowing:v1";

export interface ShadowingNoteData {
    text: string;
    language: string;
}

// Deliberately the passage as written, not the sentences split onto their own
// lines. Shadowing splits sentences at practice time, from whatever text it's
// given — baking that split into the saved note would freeze one reading of
// it, and a note you then edited would carry a split that no longer matched
// its own text.
export function formatShadowingTranscript(data: ShadowingNoteData): string {
    const heading = data.language.trim();
    return heading ? `## ${heading}\n\n${data.text}\n` : `${data.text}\n`;
}

export function encodeShadowingMetadata(data: ShadowingNoteData): string {
    return JSON.stringify({ text: data.text, language: data.language });
}

export function decodeShadowingMetadata(
    raw: string | null,
): ShadowingNoteData | null {
    if (!raw) return null;
    try {
        const payload = JSON.parse(raw);
        if (typeof payload?.text !== "string") return null;
        return {
            text: payload.text,
            language:
                typeof payload.language === "string" ? payload.language : "",
        };
    } catch {
        return null;
    }
}
