// Captures runs of letters/digits (with an optional internal apostrophe or
// hyphen, for contractions and hyphenated words) as group 1. Splitting text
// with this pattern interleaves [separator, word, separator, word, ...], so
// odd indices in the split result are always words.
const WORD_PATTERN = /([\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*)/gu;

export type TextToken = {
    text: string;
    isWord: boolean;
};

/**
 * Splits text into word and non-word (whitespace/punctuation) tokens, in
 * order, so callers can render each word individually — as a lookup
 * trigger, a toggleable mark, or anything else — while leaving surrounding
 * text exactly as it was.
 */
export function tokenizeWords(text: string): TextToken[] {
    return text
        .split(WORD_PATTERN)
        .map((part, index) => ({ text: part, isWord: index % 2 === 1 }));
}
