import { describe, it, expect } from "vitest";
import {
    correctionBadges,
    findCorrectionSpans,
    unmarkedReason,
} from "./correction-spans";

// The marks in Writing Check, Speak Check and both chats come from here.
// A wrong span marks the wrong words in your own sentence, which reads as
// the app telling you a correct word was the mistake.

const text = "Ich habe gestern ins Kino gegangen und war sehr müde.";

describe("findCorrectionSpans", () => {
    it("finds each quoted mistake where it is in the text", () => {
        const spans = findCorrectionSpans(text, [{ original: "habe" }]);
        expect(spans).toEqual([{ start: 4, end: 8, index: 0 }]);
        expect(text.slice(spans[0].start, spans[0].end)).toBe("habe");
    });

    it("returns them in reading order, whatever order they came in", () => {
        const spans = findCorrectionSpans(text, [
            { original: "sehr müde" },
            { original: "habe" },
        ]);
        expect(spans.map((span) => span.index)).toEqual([1, 0]);
    });

    // The model sometimes paraphrases instead of quoting. Marking a guess
    // would be worse than marking nothing.
    it("skips a correction whose wording isn't in the text", () => {
        expect(findCorrectionSpans(text, [{ original: "Ich hatte" }])).toEqual([]);
        expect(findCorrectionSpans(text, [{ original: "" }])).toEqual([]);
    });

    it("drops a mistake that overlaps one already marked", () => {
        const spans = findCorrectionSpans(text, [
            { original: "habe gestern" },
            { original: "gestern ins" },
        ]);
        expect(spans.map((span) => span.index)).toEqual([0]);
    });
});

describe("correctionBadges", () => {
    it("numbers the marked mistakes 1, 2, 3 in reading order", () => {
        const corrections = [
            { original: "sehr müde" },
            { original: "not in the text" },
            { original: "habe" },
        ];
        const badges = correctionBadges(findCorrectionSpans(text, corrections));
        expect(badges.get(2)).toBe(1);
        expect(badges.get(0)).toBe(2);
        // No number for the one that wasn't found, which is how the list
        // knows to say it isn't marked.
        expect(badges.has(1)).toBe(false);
    });
});

describe("unmarkedReason", () => {
    it("says an exactly quoted mistake overlaps another, not that it didn't match", () => {
        expect(unmarkedReason(text, "gestern ins")).toMatch(/overlaps/);
    });

    it("says the wording didn't match when it isn't in the text", () => {
        expect(unmarkedReason(text, "Ich hatte")).toMatch(/didn't match/);
    });
});
