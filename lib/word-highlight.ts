import { maskUnspeakable } from "./speech-text";

// Marking the word being read, not only the sentence (Question 118), the way
// Balabolka and Edge's Read Aloud do.
//
// The voice reports where each word starts, as a position in the text it was
// given. That is not the text on the screen: lib/speech-text.ts drops
// symbols and stress marks, and Inline Listen leaves translations out. So the
// position can't be used on the screen as it is. What the two texts share is
// the order of their words, because cleaning removes symbols and marks but
// never a word. The reported position becomes "the n-th spoken word", and
// the n-th word is found on the screen.
//
// Words are split by the browser's own word segmenter, which also handles
// languages written without spaces, such as Chinese, Japanese and Thai, and
// keeps apostrophes and stress marks inside their words. A plain pattern
// stands in where the segmenter is missing.

export interface WordRange {
    start: number;
    end: number;
}

let segmenter: Intl.Segmenter | null | undefined;
function wordSegmenter(): Intl.Segmenter | null {
    if (segmenter === undefined) {
        segmenter =
            typeof Intl !== "undefined" && "Segmenter" in Intl
                ? new Intl.Segmenter(undefined, { granularity: "word" })
                : null;
    }
    return segmenter;
}

const WORD = /[\p{L}\p{M}\p{N}]+(?:['’ʼ][\p{L}\p{M}\p{N}]+)*/gu;

function wordRanges(text: string): WordRange[] {
    const words = wordSegmenter();
    if (words) {
        const ranges: WordRange[] = [];
        for (const part of words.segment(text)) {
            if (part.isWordLike) {
                ranges.push({ start: part.index, end: part.index + part.segment.length });
            }
        }
        return ranges;
    }
    return [...text.matchAll(WORD)].map((match) => ({
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
    }));
}

// The words of a sentence as it is shown, at their places in it. What the
// voice won't be given is blanked out first, without moving anything, so
// the words split exactly as they do in what the voice reads.
export function shownWords(text: string): WordRange[] {
    return wordRanges(maskUnspeakable(text));
}

// Which word of the spoken text a reported position belongs to: the word it
// falls in, or else the first word after it. Null past the last word.
export function spokenWordAt(spoken: string, charIndex: number): number | null {
    const at = wordRanges(spoken).findIndex((range) => charIndex < range.end);
    return at === -1 ? null : at;
}

export interface TextPart {
    text: string;
    // The word's number in its sentence, or null for what lies between words.
    word: number | null;
}

// A piece of the shown sentence cut into its words and what lies between
// them. words are the whole sentence's (shownWords), and offset is where the
// piece starts in the sentence: Inline Listen shows a sentence in several
// pieces (a bold word, plain text), and a word keeps its number across them.
export function textParts(text: string, words: WordRange[], offset = 0): TextPart[] {
    const parts: TextPart[] = [];
    let cursor = 0;
    words.forEach((range, word) => {
        const start = Math.max(range.start - offset, 0);
        const end = Math.min(range.end - offset, text.length);
        if (end <= start) return; // not in this piece
        if (start > cursor) parts.push({ text: text.slice(cursor, start), word: null });
        parts.push({ text: text.slice(start, end), word });
        cursor = end;
    });
    if (cursor < text.length) parts.push({ text: text.slice(cursor), word: null });
    return parts;
}
