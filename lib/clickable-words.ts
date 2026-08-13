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

export type MarkedRun = {
    text: string;
    startIndex: number;
    endIndex: number;
};

const WHITESPACE_ONLY = /^\s+$/;

/**
 * Groups tokens into runs of consecutive marked words, treating a run of
 * marked words separated only by whitespace as a single phrase — so marking
 * two adjacent words like "find" and "out" combines them into one
 * translatable unit ("find out") instead of two separate, individually
 * wrong ones. A run stops at any non-whitespace separator (punctuation) or
 * an unmarked word in between.
 *
 * Marking is by token *position*, not by word text — marking one "the"
 * marks only that occurrence, not every "the" in the passage. Two runs that
 * happen to share the same text (two separately-marked occurrences of the
 * same word) still only need translating once; that dedup happens where
 * runs are turned into translation requests, not here.
 */
export function groupMarkedRuns(
    tokens: TextToken[],
    markedIndices: ReadonlySet<number>,
): MarkedRun[] {
    const runs: MarkedRun[] = [];
    let i = 0;

    while (i < tokens.length) {
        if (!tokens[i].isWord || !markedIndices.has(i)) {
            i += 1;
            continue;
        }

        const startIndex = i;
        let endIndex = i;
        let k = i + 1;

        while (
            k + 1 < tokens.length &&
            !tokens[k].isWord &&
            WHITESPACE_ONLY.test(tokens[k].text) &&
            tokens[k + 1].isWord &&
            markedIndices.has(k + 1)
        ) {
            endIndex = k + 1;
            k += 2;
        }

        runs.push({
            text: tokens
                .slice(startIndex, endIndex + 1)
                .map((token) => token.text)
                .join(""),
            startIndex,
            endIndex,
        });
        i = endIndex + 1;
    }

    return runs;
}
