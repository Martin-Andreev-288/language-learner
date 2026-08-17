// Inline Translate already has one canonical way of writing a translated
// passage down as text: `**word** (*translation*)` — the same Markdown it
// saves to Notes and puts on the clipboard. Inline Listen receives that
// exact string, so this file is the single place that understands the
// format: `parseAnnotated` splits it into pieces for display, and
// `stripAnnotations` reduces it back to just the words that should
// actually be spoken.
//
// Worth being explicit about why this reads a *serialized* format rather
// than carrying Inline Translate's own token/run structures across, since
// that's the opposite of what Answer 167 argued for elsewhere: those
// structures are position-based, and Inline Listen's passage is editable.
// The moment a character is typed into it, any carried token positions
// describe a passage that no longer exists. The annotations, being part
// of the text itself, survive editing — move a sentence, delete a
// paragraph, and the translations move and delete with it.

// The trailing `(*…*)` is optional on purpose: Inline Translate can send a
// marked word with translations hidden, in which case it arrives as bold
// with nothing after it.
const ANNOTATION_PATTERN = /\*\*(.+?)\*\*(?:\s*\(\*(.+?)\*\))?/g;

export interface AnnotatedSegment {
  // The original word(s) — never the translation. This is what gets read
  // aloud, whether the segment was marked or not.
  text: string;
  // Present only on segments that came from a marked word, and only when
  // Inline Translate actually had a translation to send.
  translation: string | null;
  marked: boolean;
}

export function parseAnnotated(text: string): AnnotatedSegment[] {
  const segments: AnnotatedSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(ANNOTATION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({
        text: text.slice(cursor, start),
        translation: null,
        marked: false,
      });
    }
    segments.push({
      text: match[1],
      translation: match[2] ?? null,
      marked: true,
    });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      translation: null,
      marked: false,
    });
  }

  return segments;
}

// Every segment contributes its own `text` and nothing else — which is why
// "skip the translations" needs no skipping logic anywhere else: what comes
// out of here simply never contained one.
export function stripAnnotations(text: string): string {
  return parseAnnotated(text)
    .map((segment) => segment.text)
    .join("");
}
