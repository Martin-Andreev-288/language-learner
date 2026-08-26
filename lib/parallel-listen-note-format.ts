// Saves a Parallel Listen session as a note, so it can be sent straight
// back into Parallel Listen later ("Listen again") without losing which
// text belongs to which language.
//
// The note's *content* is now purely the readable transcript, and
// everything needed to reopen the session lives in the note's own metadata
// column instead of being hidden inside that text (Question 275, following
// the same fix the chat got in Question 266).
//
// The old approach put an HTML comment marker at the top of the content,
// on the assumption it would be invisible when the note was read. It isn't:
// react-markdown doesn't render raw HTML at all without the `rehype-raw`
// plugin — which this app deliberately doesn't use — so the marker showed
// up as literal text at the top of every saved note. Keeping it out of
// `content` also means editing a saved note can no longer break its
// ability to be reopened.

// Names this metadata format, so the notes list can tell a resumable
// Parallel Listen note from any other kind without reading the payload.
export const PARALLEL_LISTEN_METADATA_KIND = "parallel-listen:v1";

export interface SavedListenColumn {
    name: string;
    text: string;
}

// The note's visible half: plain Markdown meant only to be read. Never
// parsed back — everything reopening needs is in the metadata — so this is
// free to be as human-shaped as it likes without a format to preserve.
export function formatParallelListenTranscript(
    columns: SavedListenColumn[],
): string {
    const sections = columns.map((column) => {
        const heading = `## ${column.name.trim() || "Untitled"}`;
        return column.text ? `${heading}\n\n${column.text}` : heading;
    });
    return `${sections.join("\n\n")}\n`;
}

// The note's hidden half: exactly what "Listen again" needs. Plain JSON in
// its own column — no marker, no escaping, nothing that has to survive
// being embedded in Markdown.
export function encodeParallelListenMetadata(
    columns: SavedListenColumn[],
): string {
    return JSON.stringify({ columns });
}

export function decodeParallelListenMetadata(
    raw: string | null,
): SavedListenColumn[] | null {
    if (!raw) return null;
    try {
        const payload = JSON.parse(raw);
        if (!Array.isArray(payload?.columns)) return null;
        const columns = payload.columns.filter(
            (column: unknown): column is SavedListenColumn =>
                typeof (column as SavedListenColumn)?.name === "string" &&
                typeof (column as SavedListenColumn)?.text === "string",
        );
        return columns.length > 0 ? columns : null;
    } catch {
        return null;
    }
}
