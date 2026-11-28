import { describe, it, expect } from "vitest";
import { shownWords, spokenWordAt, textParts } from "./word-highlight";
import { speakableText } from "./speech-text";
import { withoutStressMarks } from "./stress-marks";

// The voice reports a position in the cleaned text it was given; the page
// marks a word in the text it shows. These hold the two together
// (Question 118).

// The spoken words and where each starts, the way a voice reports them.
function spokenWords(spoken: string) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return [...segmenter.segment(spoken)]
        .filter((part) => part.isWordLike)
        .map((part) => ({ word: part.segment, start: part.index }));
}

describe("spokenWordAt", () => {
    const spoken = "One two three four.";

    it("finds the word a reported position starts", () => {
        expect(spokenWordAt(spoken, 0)).toBe(0);
        expect(spokenWordAt(spoken, 8)).toBe(2);
    });

    it("finds the word a position falls inside, or the next one after a gap", () => {
        expect(spokenWordAt(spoken, 5)).toBe(1);
        expect(spokenWordAt(spoken, 3)).toBe(1);
    });

    it("is null past the last word", () => {
        expect(spokenWordAt(spoken, 18)).toBeNull();
    });
});

describe("the n-th spoken word is the n-th shown word", () => {
    it.each([
        ["stress marks", "Ты говори\u0301шь по-англи\u0301йски?"],
        ["symbols the voice skips", "Read this and/or that (twice) — #now!"],
        ["apostrophes", "Don't go, l'eau est froide."],
        ["an underscore, which joins words until it is blanked", "x_y and snake_case"],
        ["numbers and a currency", "It costs 20 € for ½ a litre."],
        ["Chinese, written without spaces", "你好，世界。我们去学校吧。"],
    ])("%s", (_label, shown) => {
        const spoken = speakableText(shown);
        const words = shownWords(shown);
        const said = spokenWords(spoken);

        expect(words).toHaveLength(said.length);
        said.forEach(({ word, start }, n) => {
            expect(spokenWordAt(spoken, start)).toBe(n);
            const onScreen = shown.slice(words[n].start, words[n].end);
            expect(withoutStressMarks(onScreen)).toBe(word);
        });
    });
});

describe("textParts", () => {
    it("cuts a sentence into its numbered words and what lies between", () => {
        const text = "Hello, world!";
        expect(textParts(text, shownWords(text))).toEqual([
            { text: "Hello", word: 0 },
            { text: ", ", word: null },
            { text: "world", word: 1 },
            { text: "!", word: null },
        ]);
    });

    // Inline Listen shows a sentence in pieces (a bold word, plain text),
    // and a word keeps the number it has in the whole sentence.
    it("numbers the words of a piece by their place in the whole sentence", () => {
        const sentence = "Ich möchte schlafen.";
        const words = shownWords(sentence);
        expect(textParts("möchte", words, 4)).toEqual([{ text: "möchte", word: 1 }]);
        expect(textParts(" schlafen.", words, 10)).toEqual([
            { text: " ", word: null },
            { text: "schlafen", word: 2 },
            { text: ".", word: null },
        ]);
    });
});
