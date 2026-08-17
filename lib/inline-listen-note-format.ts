// Serializes/deserializes an Inline Listen passage as a note's plain-text
// content, so a saved note can be sent straight back into Inline Listen
// later ("Listen again") — same shape and same reasoning as
// lib/parallel-listen-note-format.ts (a simple, explicit format designed
// for round-tripping this page's own data, not for recovering structure
// from someone else's rendered output). A single field rather than
// several columns, and its own marker rather than reusing Parallel
// Listen's — a saved note needs to say unambiguously which Listen page
// can re-open it.
const MARKER = "<!-- inline-listen:v1 -->";

export interface InlineListenNoteData {
  text: string;
  sourceLanguage: string;
}

export function formatInlineListenNote(data: InlineListenNoteData): string {
  return `${MARKER}\n\n## ${data.sourceLanguage}\n${data.text}\n`;
}

// Preview text is just the start of a note's content (see PREVIEW_LENGTH in
// note-folder-actions.ts), so this also works directly on a note preview —
// no need to fetch the full note just to decide whether to show a "Listen
// again" action on its card.
export function isInlineListenNote(contentOrPreview: string): boolean {
  return contentOrPreview.startsWith(MARKER);
}

export function parseInlineListenNote(
  content: string,
): InlineListenNoteData | null {
  if (!isInlineListenNote(content)) return null;

  const body = content.slice(MARKER.length).trim();
  const newlineIndex = body.indexOf("\n");
  if (newlineIndex === -1) {
    return { sourceLanguage: body.replace(/^##\s*/, ""), text: "" };
  }
  return {
    sourceLanguage: body.slice(0, newlineIndex).replace(/^##\s*/, ""),
    text: body.slice(newlineIndex + 1),
  };
}
