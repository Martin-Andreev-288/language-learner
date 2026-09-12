// Comparing what you said to the sentence you were shadowing (Question 373).
//
// Lives here rather than in the action for the usual reason (see the top of
// lib/shadowing-generation.ts): a "use server" module may only export async
// functions. But there's a second reason this time — the cheap comparison
// below runs on *both* sides, in the page to avoid a needless round trip and
// in the action as a guard, so it has to be somewhere both can import.

// How close the attempt came. Three bands rather than a score out of ten,
// for the same reason the register list is named rather than numbered: a
// number invites you to chase it, and "7.4/10 pronunciation" would be a
// precision this can't actually deliver.
export type ShadowingVerdict = "match" | "close" | "off";

export interface ShadowingDifference {
    // The word or short phrase from the sentence you were meant to say.
    expected: string;
    // What came back instead. Empty when the word was simply missed out.
    heard: string;
    // Why it matters, in a line — or that it probably doesn't.
    note: string;
}

export interface ShadowingCheck {
    verdict: ShadowingVerdict;
    summary: string;
    differences: ShadowingDifference[];
}

// What this check can and cannot tell you, in one place so the page and the
// prompt can't drift apart on it.
//
// Worth being blunt about, because the obvious assumption is wrong: this
// does *not* grade your accent. Speech recognition hands back words, not
// sounds, so what it really measures is whether you were understood — which
// is a genuine signal, and a different one from "did you sound native".
export const SHADOWING_CHECK_CAVEAT =
    "This compares the words that were heard, not how they sounded — so it tells you whether you were understood, not whether your accent was right.";

// Punctuation and case are not things you can say out loud, and the
// recogniser invents both. Stripping them is what stops "Guten Tag!" and
// "guten tag" from being reported as a difference.
//
// Apostrophes go with the rest of the punctuation rather than being spared:
// "l'eau" and "l eau" both flatten to "leau", so a French elision doesn't
// become a mistake on account of where the recogniser put a mark nobody
// pronounced.
export function normalizeForComparison(value: string): string {
    return value
        .toLowerCase()
        .replace(/[\p{P}\p{S}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// The free half of the check.
//
// When the recogniser heard exactly the sentence, there is nothing for a
// model to add — "you said it correctly" is the entire finding, and paying
// a request from the daily allowance to be told so would be waste. This is
// also the common case once a sentence has been practised a couple of
// times, so it's the path worth making instant rather than the rare one.
export function isWordPerfect(target: string, attempt: string): boolean {
    const normalizedTarget = normalizeForComparison(target);
    return (
        normalizedTarget.length > 0 &&
        normalizedTarget === normalizeForComparison(attempt)
    );
}
