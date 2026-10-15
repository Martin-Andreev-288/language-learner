import { describe, it, expect } from "vitest";
import { buildParagraphs } from "./paragraph-sentences";
import { splitIntoSentences } from "./sentence-split";

// Inline Listen and Parallel Listen show a passage in its pasted
// paragraphs while reading it one sentence at a time. The highlight finds
// the sentence being read by its index, so the indexes have to run across
// paragraphs exactly as the reading queue counts them.

describe("buildParagraphs", () => {
    it("groups sentences by the lines they were pasted on, counting across them", () => {
        expect(buildParagraphs("A eins. B zwei.\n\nC drei.\nD vier. E fünf.")).toEqual([
            [
                { text: "A eins.", index: 0 },
                { text: "B zwei.", index: 1 },
            ],
            [{ text: "C drei.", index: 2 }],
            [
                { text: "D vier.", index: 3 },
                { text: "E fünf.", index: 4 },
            ],
        ]);
    });

    it("leaves out blank lines rather than making empty paragraphs", () => {
        expect(buildParagraphs("\n  \nEins.\n\n \nZwei.\n")).toEqual([
            [{ text: "Eins.", index: 0 }],
            [{ text: "Zwei.", index: 1 }],
        ]);
    });

    it("returns nothing for empty or blank text", () => {
        expect(buildParagraphs("")).toEqual([]);
        expect(buildParagraphs("\n \n")).toEqual([]);
    });

    // The reading queue is built from splitIntoSentences on the whole text,
    // so the two must agree on every sentence and its position, or the
    // highlight lands on the wrong one.
    it("produces the same sentences, in the same order, as splitting the whole text", () => {
        const passages = [
            "Gestern kam Dr. Wagner.\nEr war müde. Sehr müde!\n\nDann schlief er.",
            "Das ist das 7. Buch.\n\n\nAm 12. januar war es kalt. Ja.",
            "Привет. Как дела?\nХорошо!",
        ];
        for (const passage of passages) {
            const flat = buildParagraphs(passage).flat();
            expect(flat.map((sentence) => sentence.text)).toEqual(splitIntoSentences(passage));
            expect(flat.map((sentence) => sentence.index)).toEqual(flat.map((_, i) => i));
        }
    });
});
