import { describe, it, expect } from "vitest";
import { buildListCopy, buildTableCopy, cellText } from "./vocabulary-copy";

// Copy turns the word list into text that is pasted somewhere this app
// never sees again, so a broken table is only ever noticed by the person
// who pasted it. The first version produced "| | Word | Level ||", and the
// fields feeding it are free text from a person or a model.

describe("cellText", () => {
    it("puts a multi-line value on one line, one part per former line", () => {
        expect(cellText("Ich gehe.\nDu gehst.\nEr geht.")).toBe(
            "Ich gehe.; Du gehst.; Er geht.",
        );
    });

    it("drops blank lines and the spaces around each line", () => {
        expect(cellText("  eins \n\n   \n zwei  ")).toBe("eins; zwei");
    });

    it("handles Windows line endings the same way", () => {
        expect(cellText("eins\r\nzwei\r\n")).toBe("eins; zwei");
    });

    // An unescaped pipe ends the cell early and shifts every column after
    // it; escaping keeps the character, which is someone's own text.
    it("escapes a pipe instead of removing it", () => {
        expect(cellText("either | or")).toBe("either \\| or");
    });

    it("turns a tab into a space, so it can't become a column elsewhere", () => {
        expect(cellText("a\tb")).toBe("a b");
    });

    it("leaves an empty value empty", () => {
        expect(cellText("")).toBe("");
        expect(cellText(" \n ")).toBe("");
    });
});

describe("buildTableCopy", () => {
    const columns = [
        { key: "word", label: "Word" },
        { key: "level", label: "Level" },
        { key: "aiExamples", label: "Examples" },
    ];

    it("writes a markdown table: header, divider, one row per word", () => {
        const copy = buildTableCopy(columns, [
            { values: { word: "Haus", level: "A1", aiExamples: "Das Haus ist alt.\nEs ist groß." } },
            { values: { word: "gehen", level: "A1", aiExamples: "Ich gehe." } },
        ]);
        expect(copy).toBe(
            [
                "| Word | Level | Examples |",
                "| --- | --- | --- |",
                "| Haus | A1 | Das Haus ist alt.; Es ist groß. |",
                "| gehen | A1 | Ich gehe. |",
            ].join("\n"),
        );
    });

    it("keeps every row the width of the header when a value is missing", () => {
        const copy = buildTableCopy(columns, [{ values: { word: "Haus", aiExamples: "" } }]);
        expect(copy.split("\n")[2]).toBe("| Haus |  |  |");
        for (const line of copy.split("\n")) {
            expect(line.split(" | ")).toHaveLength(columns.length);
        }
    });

    it("follows the column order it is given, not the order of the values", () => {
        const copy = buildTableCopy(
            [
                { key: "level", label: "Level" },
                { key: "word", label: "Word" },
            ],
            [{ values: { word: "Haus", level: "A1" } }],
        );
        expect(copy.split("\n")[2]).toBe("| A1 | Haus |");
    });

    it("cannot be broken by a pipe or a line break inside a value", () => {
        const copy = buildTableCopy(columns, [
            { values: { word: "a|b", level: "A1", aiExamples: "x\ny" } },
        ]);
        expect(copy.split("\n")).toHaveLength(3);
        expect(copy.split("\n")[2]).toBe("| a\\|b | A1 | x; y |");
    });

    it("is just the header and divider when there are no rows", () => {
        expect(buildTableCopy(columns, [])).toBe(
            "| Word | Level | Examples |\n| --- | --- | --- |",
        );
    });
});

describe("buildListCopy", () => {
    it("writes one line per word: the word, its noun info, then each language", () => {
        expect(
            buildListCopy([
                {
                    word: "Versammlung",
                    nounInfo: "f, -en",
                    groups: [
                        { tag: "[en]", text: "assembly, meeting" },
                        { tag: "[fr]", text: "réunion" },
                    ],
                },
                { word: "gehen", nounInfo: "", groups: [{ tag: "[en]", text: "to go" }] },
            ]),
        ).toBe("Versammlung f, -en [en] assembly, meeting / [fr] réunion\ngehen [en] to go");
    });

    // A tag with nothing behind it is an empty translation wearing a label.
    it("leaves out a language with no translation, and missing noun info", () => {
        expect(
            buildListCopy([
                {
                    word: "Haus",
                    nounInfo: " ",
                    groups: [
                        { tag: "[en]", text: "" },
                        { tag: "[fr]", text: "maison" },
                        { tag: "[it]", text: " \n " },
                    ],
                },
            ]),
        ).toBe("Haus [fr] maison");
    });

    it("is just the word when there is nothing else to say", () => {
        expect(buildListCopy([{ word: "Haus", nounInfo: "", groups: [] }])).toBe("Haus");
    });

    it("keeps a translation that spans lines on its word's line", () => {
        expect(
            buildListCopy([
                { word: "Bank", nounInfo: "f, -en", groups: [{ tag: "[en]", text: "bench\nbank" }] },
            ]),
        ).toBe("Bank f, -en [en] bench; bank");
    });

    it("is empty when there are no rows", () => {
        expect(buildListCopy([])).toBe("");
    });
});
