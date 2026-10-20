import { describe, it, expect } from "vitest";
import { diffWords, type DiffSegment } from "./word-diff";

// Show changes draws exactly what this returns. A change marked in the
// wrong place reads as the app correcting a word you got right, and a
// change it misses is a correction you never see.

// [-removed-] and {+added+}, so each expectation reads like the screen.
function show(segments: DiffSegment[]) {
    return segments
        .map((segment) =>
            segment.kind === "removed"
                ? `[-${segment.text}-]`
                : segment.kind === "added"
                  ? `{+${segment.text}+}`
                  : segment.text,
        )
        .join("");
}

const diff = (before: string, after: string) => show(diffWords(before, after));

describe("diffWords", () => {
    it("marks nothing when nothing changed", () => {
        expect(diffWords("Ich bin müde.", "Ich bin müde.")).toEqual([
            { kind: "same", text: "Ich bin müde." },
        ]);
    });

    it("shows a replaced word as the old one, then the new one", () => {
        expect(diff("Ich habe ins Kino gegangen.", "Ich bin ins Kino gegangen.")).toBe(
            "Ich [-habe-] {+bin+} ins Kino gegangen.",
        );
    });

    it("shows an added word, and a removed one", () => {
        expect(diff("Ich gehe Kino.", "Ich gehe ins Kino.")).toBe("Ich gehe {+ins+} Kino.");
        expect(diff("Das ist sehr sehr gut.", "Das ist sehr gut.")).toBe(
            "Das ist sehr [-sehr-] gut.",
        );
    });

    // Punctuation is its own token, so a missing comma is one small change,
    // not the word before it replaced.
    it("treats punctuation separately from the word beside it", () => {
        expect(diff("Ich glaube dass er kommt.", "Ich glaube, dass er kommt.")).toBe(
            "Ich glaube{+,+} dass er kommt.",
        );
        expect(diff("Wirklich.", "Wirklich!")).toBe("Wirklich[-.-]{+!+}");
    });

    // Word order is the most common German correction there is.
    it("keeps a reordered phrase readable: the old order, then the new", () => {
        expect(diff("Gestern ich habe gearbeitet.", "Gestern habe ich gearbeitet.")).toBe(
            "Gestern [-ich-] habe {+ich+} gearbeitet.",
        );
    });

    it("never strikes through or highlights a space", () => {
        for (const segment of diffWords("ich habe es", "er hat es")) {
            if (segment.kind !== "same") expect(segment.text).not.toMatch(/\s/);
        }
    });

    it("keeps a removed first word apart from the word after it", () => {
        expect(diff("Und ich gehe.", "ich gehe.")).toBe("[-Und-] ich gehe.");
        expect(diff("Und ich gehe.", "Ich gehe.")).toBe("[-Und-] [-ich-] {+Ich+} gehe.");
    });

    it("compares changes, not spacing or line breaks", () => {
        expect(diff("Hallo  Welt", "Hallo Welt")).toBe("Hallo Welt");
        expect(diff("Erste Zeile\nzweite Zeile", "Erste Zeile\nzweite Zeile.")).toBe(
            "Erste Zeile\nzweite Zeile{+.+}",
        );
    });

    it("keeps letters with accents, umlauts and apostrophes inside one word", () => {
        expect(diff("C'est très bien", "C'est très beau")).toBe("C'est très [-bien-] {+beau+}");
        expect(diff("für Müller", "für Mueller")).toBe("für [-Müller-] {+Mueller+}");
    });

    it("handles an empty side", () => {
        expect(diff("", "Neu")).toBe("{+Neu+}");
        expect(diff("Alt", "")).toBe("[-Alt-]");
    });

    // A near-total rewrite of a long text is shown as "all of this went,
    // all of this came" instead of being compared word by word.
    it("still answers for a very long, completely rewritten text", () => {
        const before = Array.from({ length: 2500 }, (_, n) => `a${n}`).join(" ");
        const after = Array.from({ length: 2500 }, (_, n) => `b${n}`).join(" ");
        const segments = diffWords(before, after);
        expect(segments.some((segment) => segment.kind === "removed")).toBe(true);
        expect(segments.some((segment) => segment.kind === "added")).toBe(true);
    });
});
