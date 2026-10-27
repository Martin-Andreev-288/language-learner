import { describe, it, expect } from "vitest";
import { tokenizeWords } from "./clickable-words";
import {
    inAskedOrder,
    sentenceAroundToken,
    uniqueLanguages,
    wordTranslationPrompt,
} from "./word-lookup";

// The shared word-lookup window's pieces that aren't the screen (Question
// 55, chapter B): what is sent as context, and how answers are ordered.

const indexOf = (tokens: ReturnType<typeof tokenizeWords>, word: string) =>
    tokens.findIndex((token) => token.isWord && token.text === word);

describe("sentenceAroundToken", () => {
    const passage = "Ich bin müde. Aber ich möchte noch lesen! Morgen ist ein neuer Tag.";
    const tokens = tokenizeWords(passage);

    it("sends the sentence the word is in, not the whole passage", () => {
        expect(sentenceAroundToken(tokens, indexOf(tokens, "möchte"))).toBe("Aber ich möchte noch lesen!");
        expect(sentenceAroundToken(tokens, indexOf(tokens, "müde"))).toBe("Ich bin müde.");
        expect(sentenceAroundToken(tokens, indexOf(tokens, "Tag"))).toBe("Morgen ist ein neuer Tag.");
    });

    it("treats a line break as the end of a sentence, for passages pasted as lists", () => {
        const list = tokenizeWords("der Tisch\ndie Lampe\ndas Buch");
        expect(sentenceAroundToken(list, indexOf(list, "Lampe"))).toBe("die Lampe");
    });

    it("cuts a very long sentence down to the part around the word, in whole words", () => {
        const long = tokenizeWords(`${"eins zwei drei ".repeat(60)}Ziel ${"vier fünf sechs ".repeat(60)}`);
        const context = sentenceAroundToken(long, indexOf(long, "Ziel"), 120);
        expect(context.length).toBeLessThanOrEqual(120);
        expect(context).toContain("Ziel");
        expect(context.startsWith(" ") || context.endsWith(" ")).toBe(false);
        expect(context.split(" ").every((word) => ["eins", "zwei", "drei", "Ziel", "vier", "fünf", "sechs"].includes(word))).toBe(true);
    });
});

describe("uniqueLanguages", () => {
    it("drops empty and repeated languages, keeping the first spelling", () => {
        expect(uniqueLanguages([" Bulgarian ", "", "bulgarian", "English"])).toEqual(["Bulgarian", "English"]);
    });
});

describe("inAskedOrder", () => {
    it("returns the asked order and spelling, and leaves out empty answers", () => {
        const returned = [
            { language: "english", text: " tired " },
            { language: "BULGARIAN", text: "уморен" },
            { language: "French", text: "" },
        ];
        expect(inAskedOrder(["Bulgarian", "English", "French"], returned)).toEqual([
            { language: "Bulgarian", text: "уморен" },
            { language: "English", text: "tired" },
        ]);
    });
});

describe("wordTranslationPrompt", () => {
    it("asks for the word in its sentence, into each language, and the sentence's language", () => {
        const prompt = wordTranslationPrompt("müde", "Ich bin müde.", ["Bulgarian", "English"]);
        expect(prompt).toContain('"""\nIch bin müde.\n"""');
        expect(prompt).toContain("into each of these languages: Bulgarian, English");
        expect(prompt).toMatch(/languageCode: the BCP-47 language tag/);
    });
});
