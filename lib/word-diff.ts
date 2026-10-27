// What changed between the text you checked and its fully corrected
// version, word by word, for the Show changes switch on Writing Check. The
// corrections list already says what was wrong one mistake at a time; this
// shows the whole passage with every change in place.
//
// Words and punctuation are compared as separate tokens, so a comma added
// after a word shows as one added comma, not as the whole word replaced.
// Whitespace is never compared: it rides along with the token after it, so
// a reflowed line or a double space doesn't show up as a change.

export type DiffSegment = {
    kind: "same" | "added" | "removed";
    text: string;
};

type Token = { lead: string; text: string };

// A word (letters, marks, digits, and the apostrophes inside words like
// "don't" or "l'eau"), or any single other non-space character.
const TOKEN = /[\p{L}\p{M}\p{N}'’]+|[^\s\p{L}\p{M}\p{N}]/gu;

function tokenize(text: string): { tokens: Token[]; trailing: string } {
    const tokens: Token[] = [];
    let cursor = 0;
    for (const match of text.matchAll(TOKEN)) {
        const start = match.index ?? 0;
        tokens.push({ lead: text.slice(cursor, start), text: match[0] });
        cursor = start + match[0].length;
    }
    return { tokens, trailing: text.slice(cursor) };
}

// Above this many comparisons (the two changed middles multiplied), the
// middle is shown as one removal and one addition instead. Only a near
// total rewrite of a long passage gets there, and for that "all of it
// changed" is the honest picture anyway.
const MAX_COMPARISONS = 4_000_000;

export function diffWords(before: string, after: string): DiffSegment[] {
    const a = tokenize(before).tokens;
    const { tokens: b, trailing } = tokenize(after);

    // Corrections usually touch a few words in a long text, so the shared
    // beginning and end are set aside first and only the middle is compared.
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix].text === b[prefix].text) {
        prefix++;
    }
    let suffix = 0;
    while (
        suffix < a.length - prefix &&
        suffix < b.length - prefix &&
        a[a.length - 1 - suffix].text === b[b.length - 1 - suffix].text
    ) {
        suffix++;
    }

    const midA = a.slice(prefix, a.length - suffix);
    const midB = b.slice(prefix, b.length - suffix);
    const ops: { kind: DiffSegment["kind"]; token: Token }[] = [];

    for (const token of b.slice(0, prefix)) ops.push({ kind: "same", token });

    if (midA.length * midB.length > MAX_COMPARISONS) {
        for (const token of midA) ops.push({ kind: "removed", token });
        for (const token of midB) ops.push({ kind: "added", token });
    } else {
        // Longest common subsequence over the middle, filled from the end so
        // the walk below can go forwards.
        const width = midB.length + 1;
        const lengths = new Int32Array((midA.length + 1) * width);
        for (let i = midA.length - 1; i >= 0; i--) {
            for (let j = midB.length - 1; j >= 0; j--) {
                lengths[i * width + j] =
                    midA[i].text === midB[j].text
                        ? lengths[(i + 1) * width + j + 1] + 1
                        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
            }
        }
        let i = 0;
        let j = 0;
        while (i < midA.length && j < midB.length) {
            if (midA[i].text === midB[j].text) {
                ops.push({ kind: "same", token: midB[j] });
                i++;
                j++;
            } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
                ops.push({ kind: "removed", token: midA[i] });
                i++;
            } else {
                ops.push({ kind: "added", token: midB[j] });
                j++;
            }
        }
        for (; i < midA.length; i++) ops.push({ kind: "removed", token: midA[i] });
        for (; j < midB.length; j++) ops.push({ kind: "added", token: midB[j] });
    }

    for (const token of b.slice(b.length - suffix)) ops.push({ kind: "same", token });

    return toSegments(ops, trailing);
}

// Between two unchanged words, every removal is shown before every addition
// ("~~ich habe~~ habe ich"), so a replaced phrase reads as the old version
// and then the new one rather than as a word-by-word zigzag.
//
// Spaces are always "same" segments, never inside a mark, so nothing but
// the words themselves is struck through or highlighted. The corrected
// text's own spacing is used wherever it exists; a removed word, which has
// no place in the corrected text, gets a single space where it needs one.
const WORDISH = /[\p{L}\p{N}]/u;

function toSegments(
    ops: { kind: DiffSegment["kind"]; token: Token }[],
    trailing: string,
): DiffSegment[] {
    const out: DiffSegment[] = [];
    const push = (kind: DiffSegment["kind"], text: string) => {
        if (!text) return;
        const last = out.at(-1);
        if (last && last.kind === kind) last.text += text;
        else out.push({ kind, text });
    };

    let removed: Token[] = [];
    let added: Token[] = [];
    // Set after a block that only removed words, when the corrected text
    // has nothing between the words on either side of it ("Und ich" →
    // "ich" at the very start): without a space there, the struck word and
    // the next one would run together.
    let needsGapBeforeNext = false;

    const flush = () => {
        if (removed.length === 0 && added.length === 0) return;

        const lead =
            added.length > 0 ? added[0].lead : removed[0].lead === "" ? "" : " ";
        push("same", lead);

        removed.forEach((token, n) => {
            if (n > 0 && token.lead !== "") push("same", " ");
            push("removed", token.text);
        });

        if (removed.length > 0 && added.length > 0) {
            const wordy = WORDISH.test(removed[0].text) || WORDISH.test(added[0].text);
            push("same", wordy ? " " : "");
        }

        added.forEach((token, n) => {
            if (n > 0) push("same", token.lead);
            push("added", token.text);
        });

        needsGapBeforeNext =
            added.length === 0 && WORDISH.test(removed[removed.length - 1].text);
        removed = [];
        added = [];
    };

    for (const op of ops) {
        if (op.kind === "removed") {
            removed.push(op.token);
        } else if (op.kind === "added") {
            added.push(op.token);
        } else {
            flush();
            const gap =
                needsGapBeforeNext && op.token.lead === "" && WORDISH.test(op.token.text)
                    ? " "
                    : op.token.lead;
            needsGapBeforeNext = false;
            push("same", gap + op.token.text);
        }
    }
    flush();
    push("same", trailing);

    return out;
}
