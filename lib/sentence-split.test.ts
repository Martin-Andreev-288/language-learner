import { describe, it, expect } from "vitest";
import { splitIntoSentences } from "./sentence-split";

// Every rule in this splitter was added after a passage was cut in the wrong
// place, and each one is a regex a small edit can quietly break for one
// language and not another. Nothing throws when that happens — Parallel
// Listen just pairs the wrong sentences, and Shadowing hands you half of one.

describe("splitIntoSentences", () => {
    describe("the basic split", () => {
        it("splits after . ! and ? followed by a capital", () => {
            expect(splitIntoSentences("Wirklich? Ja! Ich gehe. Du auch.")).toEqual([
                "Wirklich?",
                "Ja!",
                "Ich gehe.",
                "Du auch.",
            ]);
        });

        it("treats a capital with an accent, and a Cyrillic one, as a sentence start", () => {
            expect(splitIntoSentences("Ça va. Élodie arrive. Ja. Ärger.")).toEqual([
                "Ça va.",
                "Élodie arrive.",
                "Ja.",
                "Ärger.",
            ]);
            expect(splitIntoSentences("Привет. Как дела? Хорошо!")).toEqual([
                "Привет.",
                "Как дела?",
                "Хорошо!",
            ]);
        });

        it("splits before a sentence that starts with a number", () => {
            expect(splitIntoSentences("Das kostet 5 Euro. 10 Euro wären zu viel.")).toEqual([
                "Das kostet 5 Euro.",
                "10 Euro wären zu viel.",
            ]);
        });

        it("does not split inside a decimal or after an ellipsis's own dots", () => {
            expect(splitIntoSentences("Ich habe 3.5 Euro. Gut.")).toEqual([
                "Ich habe 3.5 Euro.",
                "Gut.",
            ]);
            expect(splitIntoSentences("Ende... Anfang neu.")).toEqual(["Ende...", "Anfang neu."]);
        });

        it("always splits at a line break, and drops blank lines", () => {
            expect(splitIntoSentences("Line one\nline two\n\n\nLine three")).toEqual([
                "Line one",
                "line two",
                "Line three",
            ]);
        });

        it("returns nothing for empty or blank text", () => {
            expect(splitIntoSentences("")).toEqual([]);
            expect(splitIntoSentences("  \n ")).toEqual([]);
        });
    });

    describe("rule 1: a lower-case word after the dot continues the sentence", () => {
        it("keeps '12. januar' together", () => {
            expect(splitIntoSentences("Am 12. januar war es kalt. Dann kam Schnee.")).toEqual([
                "Am 12. januar war es kalt.",
                "Dann kam Schnee.",
            ]);
        });
    });

    describe("rule 2: a number and a dot before a word is an ordinal", () => {
        it("keeps '7. Buch' and '6. Stock' together", () => {
            expect(splitIntoSentences("Das ist das 7. Buch. Er wohnt im 6. Stock.")).toEqual([
                "Das ist das 7. Buch.",
                "Er wohnt im 6. Stock.",
            ]);
        });

        it("still splits when a line break follows the number", () => {
            expect(splitIntoSentences("Sie kam 2001.\nВъвеждане следва.")).toEqual([
                "Sie kam 2001.",
                "Въвеждане следва.",
            ]);
        });
    });

    describe("rule 3: a dot with no space before a capital is a missed space", () => {
        it("splits 'First.Second'", () => {
            expect(splitIntoSentences("First.Second sentence.")).toEqual([
                "First.",
                "Second sentence.",
            ]);
        });

        it("but not a title written without its space", () => {
            expect(splitIntoSentences("Dr.Wagner kam.")).toEqual(["Dr.Wagner kam."]);
        });
    });

    describe("rule 4: the Bulgarian year abbreviation", () => {
        it("keeps '2016 г. Андерсън' together", () => {
            expect(splitIntoSentences("През 2016 г. Андерсън спечели. После загуби.")).toEqual([
                "През 2016 г. Андерсън спечели.",
                "После загуби.",
            ]);
        });
    });

    describe("rule 5: the period of a title or abbreviation", () => {
        it.each([
            ["a German title", "Gestern kam Dr. Wagner. Er war müde.", "Gestern kam Dr. Wagner."],
            ["a compound title", "Dort war Dipl.-Ing. Weber. Er blieb.", "Dort war Dipl.-Ing. Weber."],
            ["an Italian title in lower case", "Ho visto il dott. Ferrari. Era gentile.", "Ho visto il dott. Ferrari."],
            ["an Italian title with a suffix", "Ecco la Sig.ra Bianchi. Poi parte.", "Ecco la Sig.ra Bianchi."],
            ["'z. B.' before a capital", "Tiere, z. B. Hunde, sind toll. Ja.", "Tiere, z. B. Hunde, sind toll."],
            ["a Bulgarian street", "Живея на ул. Витоша. Тя също.", "Живея на ул. Витоша."],
        ])("keeps %s together", (_label, text, first) => {
            expect(splitIntoSentences(text)[0]).toBe(first);
        });

        // Only the period is hidden, never the word, so a sentence that
        // begins with a title still begins a sentence.
        it("still splits before a sentence that starts with a title", () => {
            expect(splitIntoSentences("Yesterday. Mrs. Davies called.")).toEqual([
                "Yesterday.",
                "Mrs. Davies called.",
            ]);
        });

        it("does not find a title at the end of a longer word", () => {
            expect(splitIntoSentences("Called IBM. Nobody answered.")).toEqual([
                "Called IBM.",
                "Nobody answered.",
            ]);
        });

        // Deliberately not on the list: they end sentences all the time.
        it("does not protect 'usw.'", () => {
            expect(splitIntoSentences("Brot, Milch usw. Dann gehen wir.")).toEqual([
                "Brot, Milch usw.",
                "Dann gehen wir.",
            ]);
        });
    });

    describe("rule 6: the period after a lone initial", () => {
        it("keeps names with initials together", () => {
            expect(splitIntoSentences("Ich traf J. K. Rowling. Sie war nett.")).toEqual([
                "Ich traf J. K. Rowling.",
                "Sie war nett.",
            ]);
            expect(splitIntoSentences("George W. Bush spoke. Then he left.")).toEqual([
                "George W. Bush spoke.",
                "Then he left.",
            ]);
        });

        // The trade the source comment accepts on purpose: a sentence that
        // ends in a single capital looks exactly like an initial. If this
        // starts splitting, the rule has changed, not just this case.
        it("joins a sentence that really ends in a single capital to the next", () => {
            expect(splitIntoSentences("Das ist Plan B. Wir fangen an.")).toEqual([
                "Das ist Plan B. Wir fangen an.",
            ]);
        });
    });

    describe("forced and quoted splits", () => {
        it("always splits after 'USA.', even before a lower-case word", () => {
            expect(splitIntoSentences("We went to the USA. it was fun.")).toEqual([
                "We went to the USA.",
                "it was fun.",
            ]);
        });

        it.each([
            ["German quotes", "Er sagte: „Komm.“ Dann ging er.", "Er sagte: „Komm.“"],
            ["curly quotes", "He said “Stop.” Then he left.", "He said “Stop.”"],
            ["straight quotes", 'He said "Stop." Then he left.', 'He said "Stop."'],
            ["guillemets", "Il a dit «Oui.» Ensuite il est parti.", "Il a dit «Oui.»"],
        ])("splits after a closing quote: %s", (_label, text, first) => {
            expect(splitIntoSentences(text)[0]).toBe(first);
        });

        it("splits before a sentence that starts with a bold word", () => {
            expect(splitIntoSentences("Sie lief. **Haus** ist groß.")).toEqual([
                "Sie lief.",
                "**Haus** ist groß.",
            ]);
        });
    });

    // The protections swap characters out while the split runs and back in
    // afterwards. Rejoining the sentences gives back the passage exactly,
    // which is what proves nothing was left swapped out.
    it("gives back every character it was given", () => {
        const passages = [
            "Gestern kam Dr. Wagner mit J. K. Rowling. Dann z. B. Hunde.",
            "Das ist das 7. Buch. Am 12. januar war es kalt.",
            "През 2016 г. Андерсън спечели. Живея на ул. Витоша.",
            "Ecco la Sig.ra Bianchi. Er sagte: „Komm.“ Dann ging er.",
        ];
        for (const passage of passages) {
            expect(splitIntoSentences(passage).join(" ")).toBe(passage);
        }
    });
});
