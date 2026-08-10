// Serializes/deserializes a Parallel Listen session as a note's plain-text
// content, so a saved note can be sent straight back into Parallel Listen
// later ("Listen again") without losing which text belongs to which
// language. Deliberately not the same format Parallel Translate's notes
// use — that one flattens everything into aligned sentence rows for
// reading, which would need lossy re-parsing to recover per-language text.
// This format is designed by us for round-tripping our own data, not for
// recovering structure from someone else's already-rendered output, so a
// simple, explicit format is safe here in a way re-parsing rendered prose
// generally isn't (see Answer 167's caution about Inline Translate).
//
// Shape: a marker line (invisible when the note is viewed as Markdown,
// since it's an HTML comment), then one `## <language name>` heading per
// column followed by that column's raw pasted text, verbatim.
const MARKER = "<!-- parallel-listen:v1 -->";

export interface SavedListenColumn {
  name: string;
  text: string;
}

export function formatParallelListenNote(
  columns: SavedListenColumn[],
): string {
  const sections = columns.map((column) => {
    const heading = `## ${column.name}`;
    return column.text ? `${heading}\n${column.text}` : heading;
  });
  return `${MARKER}\n\n${sections.join("\n\n")}\n`;
}

// Preview text is just the start of a note's content (see PREVIEW_LENGTH in
// note-folder-actions.ts), so this also works directly on a note preview —
// no need to fetch the full note just to decide whether to show a "Listen
// again" action on its card.
export function isParallelListenNote(contentOrPreview: string): boolean {
  return contentOrPreview.startsWith(MARKER);
}

export function parseParallelListenNote(
  content: string,
): SavedListenColumn[] | null {
  if (!isParallelListenNote(content)) return null;

  const body = content.slice(MARKER.length);
  const sections = body
    .split(/\n(?=## )/)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.map((section) => {
    const newlineIndex = section.indexOf("\n");
    if (newlineIndex === -1) {
      return { name: section.replace(/^##\s*/, ""), text: "" };
    }
    return {
      name: section.slice(0, newlineIndex).replace(/^##\s*/, ""),
      text: section.slice(newlineIndex + 1),
    };
  });
}
