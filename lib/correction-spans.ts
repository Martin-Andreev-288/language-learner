// Where each correction's mistake sits inside the text that was checked, so
// the mistake can be marked in place. Shared by Writing Check, Speak Check
// and the two chats, so a mistake looks the same wherever the app shows
// one. Before this it was Writing Check's alone, and the chats listed their
// corrections without ever showing them in the sentence you wrote.

export type CorrectionSpan = {
    start: number;
    end: number; // exclusive
    index: number; // index into the corrections array
};

// Not every correction is guaranteed to match: the model doesn't always
// quote the source verbatim. So this returns only the ones that do, in
// reading order, with overlapping matches dropped (first-found wins) rather
// than rendered as broken, nested highlights.
export function findCorrectionSpans(
    checkedText: string,
    corrections: { original: string }[],
): CorrectionSpan[] {
    const found: CorrectionSpan[] = [];

    corrections.forEach((correction, index) => {
        if (!correction.original) return;
        const start = checkedText.indexOf(correction.original);
        if (start === -1) return;
        found.push({ start, end: start + correction.original.length, index });
    });

    found.sort((a, b) => a.start - b.start);

    const spans: CorrectionSpan[] = [];
    let lastEnd = -1;
    for (const span of found) {
        if (span.start >= lastEnd) {
            spans.push(span);
            lastEnd = span.end;
        }
    }

    return spans;
}

// The number each marked mistake carries, 1, 2, 3… in reading order, keyed
// by its correction's index — so the mark in the text and the explanation
// below it can show the same number. A correction that wasn't found has no
// entry, which is how the list knows to say it isn't marked above.
export function correctionBadges(spans: CorrectionSpan[]): Map<number, number> {
    return new Map(spans.map((span, position) => [span.index, position + 1]));
}

// Why a correction has no mark, for the line under its explanation. Two
// different reasons, and saying the wrong one sends you looking for a
// mismatch that isn't there: a mistake can be quoted exactly and still go
// unmarked because it overlaps one already marked.
export function unmarkedReason(checkedText: string, original: string): string {
    return original && checkedText.includes(original)
        ? "Not marked separately — it overlaps a mistake marked above."
        : "Not marked above — the wording didn't match the text exactly.";
}
