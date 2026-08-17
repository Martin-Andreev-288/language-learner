import { splitIntoSentences } from "@/lib/sentence-split";

export interface ParagraphSentence {
  text: string;
  // Sequential position across the whole text, not just within its own
  // paragraph — matches the index a queued utterance carries, so a
  // highlight can find this exact sentence regardless of which paragraph
  // it's visually grouped under.
  index: number;
}

// Groups a passage's own sentences by the line breaks the user actually
// pasted, instead of flattening everything into one sentence per row.
// Splitting on newlines first, then running sentence-splitting on each
// line separately, gives the identical set of sentences `splitIntoSentences`
// would produce on the whole text in one pass (it already treats a newline
// as a hard, non-crossable boundary internally) — just grouped by paragraph
// for display rather than flattened. Shared between Parallel Listen's
// Language-by-language mode and Inline Listen, the two places that both
// want to show a passage in the shape it was pasted while still reading
// and highlighting it one sentence at a time.
export function buildParagraphs(text: string): ParagraphSentence[][] {
  let index = 0;
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      splitIntoSentences(line).map((sentenceText) => ({
        text: sentenceText,
        index: index++,
      })),
    );
}
