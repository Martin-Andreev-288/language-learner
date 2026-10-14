import { describe, it, expect } from "vitest";
import {
    MAX_ENRICH_WORDS,
    MAX_TRANSLATION_LANGUAGES,
    maxWordsForLanguageCount,
    sanitizeGeneratedText,
} from "./vocabulary-enrichment";

describe("sanitizeGeneratedText", () => {
    it("turns en and em dashes into the hyphen the prompt asks for", () => {
        expect(sanitizeGeneratedText("Haus – house — building")).toBe(
            "Haus - house - building",
        );
    });

    it("straightens curly apostrophes and quotes", () => {
        expect(sanitizeGeneratedText("l’eau, ‘bitte’")).toBe("l'eau, 'bitte'");
        expect(sanitizeGeneratedText("“Hallo”")).toBe('"Hallo"');
    });

    // The corruption from Question 248: a typographic character arrives with
    // its leading byte lost, leaving invisible control characters that show
    // up as boxes.
    it("removes every character in the C1 control range", () => {
        let controls = "";
        for (let code = 0x80; code <= 0x9f; code++) {
            controls += String.fromCharCode(code);
        }
        expect(sanitizeGeneratedText(`a${controls}b`)).toBe("ab");
    });

    // The range sits right below ¡, «, ¿, À and the rest of Latin-1, which
    // half the languages here are written in. Widening it by one would
    // start eating real text.
    it("leaves the letters and punctuation just outside that range alone", () => {
        const text = "¡Sí! «¿Qué?» Straße, été, Ärger, Привет, 你好…";
        expect(sanitizeGeneratedText(text)).toBe(text);
    });

    it("composes a letter and a separate accent into one character", () => {
        expect(sanitizeGeneratedText("café")).toBe("café");
    });

    it("trims the ends but keeps the lines of a multi-line field", () => {
        expect(sanitizeGeneratedText("  Ich gehe.\nDu gehst.\n ")).toBe(
            "Ich gehe.\nDu gehst.",
        );
    });
});

describe("maxWordsForLanguageCount", () => {
    // One language is also what a batch counts as when it only translates:
    // translations are short, so they keep the full batch.
    it("keeps the full batch for one language", () => {
        expect(maxWordsForLanguageCount(1)).toBe(MAX_ENRICH_WORDS);
        expect(maxWordsForLanguageCount(0)).toBe(MAX_ENRICH_WORDS);
    });

    it("divides the batch between the languages, rounding down", () => {
        expect(maxWordsForLanguageCount(2)).toBe(15);
        expect(maxWordsForLanguageCount(3)).toBe(10);
        expect(maxWordsForLanguageCount(4)).toBe(7);
    });

    it("still allows a usable batch at the most languages one request can ask for", () => {
        // The word's own language plus every translation language.
        expect(maxWordsForLanguageCount(1 + MAX_TRANSLATION_LANGUAGES)).toBe(6);
    });

    it("never drops below one word", () => {
        expect(maxWordsForLanguageCount(MAX_ENRICH_WORDS + 1)).toBe(1);
        expect(maxWordsForLanguageCount(100)).toBe(1);
    });

    // The point of the cap: words × languages stays where a single-language
    // batch already was, instead of multiplying.
    it("keeps words times languages within one full batch", () => {
        for (let languages = 1; languages <= MAX_ENRICH_WORDS; languages++) {
            expect(maxWordsForLanguageCount(languages) * languages).toBeLessThanOrEqual(
                MAX_ENRICH_WORDS,
            );
        }
    });
});
