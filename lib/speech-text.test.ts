import { describe, it, expect } from "vitest";
import { speakableText } from "./speech-text";

// These checks existed before Vitest did — they were a throwaway script run
// once while Question 411 was being answered, and they earned their keep
// twice in that one sitting: they caught the rule stripping the comma and
// full stop out of Chinese, and the Greek ano teleia being listed under only
// one of the two codepoints that render it. Neither failure would have
// thrown anything. The voice would simply have read those languages flat.
//
// That is the argument for having them here rather than in a scratch file:
// the bugs this helper attracts are silent ones in scripts nobody on the
// project reads, and a rule that says "everything except this list" is one
// edit away from dropping a language at any time.

// A character is "removed" if it leaves no trace between two words.
const isRemoved = (character: string) =>
    speakableText(`a ${character} b`) === "a b";

describe("speakableText", () => {
    describe("removes what a synthesiser would read aloud as a word", () => {
        it.each([
            ["the four from Question 410", ["#", "*", "/", ">"]],
            ["the nine from Question 411", ["@", "$", "%", "^", "&", "_", "+", "=", "\\"]],
            ["brackets and braces", ["(", ")", "[", "]", "{", "}", "<"]],
            ["currency", ["€", "£", "¥", "¢", "¤", "₽", "₹"]],
            ["maths", ["±", "×", "÷", "≠", "≤", "≥", "∞", "∑", "√"]],
            ["legal and editorial", ["©", "®", "™", "§", "¶", "†", "‡"]],
            ["bullets and arrows", ["•", "●", "■", "→", "←", "⇒"]],
            ["units and the rest", ["°", "‰", "¬", "¦", "˜", "`", "|", "~"]],
        ])("%s", (_label, characters) => {
            expect(characters.filter((c) => !isRemoved(c))).toEqual([]);
        });

        // The point of the allowlist is that it covers what nobody listed.
        // If this number collapses, someone has widened the rule by accident.
        it("covers the whole of Unicode, not just the characters we thought of", () => {
            const symbols: string[] = [];
            for (let code = 0x20; code <= 0x2ffff; code++) {
                const character = String.fromCodePoint(code);
                if (/\p{P}|\p{S}/u.test(character)) symbols.push(character);
            }
            const kept = symbols.filter((c) => !isRemoved(c));

            expect(symbols.length).toBeGreaterThan(9000);
            expect(kept.length).toBeLessThan(60);
        });
    });

    describe("keeps the punctuation a voice uses for timing", () => {
        it("keeps the Latin set", () => {
            expect(speakableText("Ja, gut; so: nein! Wie? Also…")).toBe(
                "Ja, gut; so: nein! Wie? Also…",
            );
        });

        // The gender-and-plural string beside half the German nouns in the
        // vocabulary list. An earlier draft of this rule mangled it.
        it("keeps a hyphen, so 'f, -en' survives", () => {
            expect(speakableText("f, -en")).toBe("f, -en");
        });

        it("keeps all three apostrophes", () => {
            // Straight, curly, and the modifier letter. Lose any one and
            // "don't" becomes "dont" in some passage somewhere.
            expect(speakableText("don't l’eau oʼzapft")).toBe(
                "don't l’eau oʼzapft",
            );
        });

        it("keeps quotation marks in the shapes these languages use", () => {
            expect(speakableText("„Hallo“ und «bonjour»")).toBe("„Hallo“ und «bonjour»");
        });
    });

    // One sentence per script the app offers. A Latin-only rule passes every
    // test a Latin-speaking author thinks to write.
    describe("leaves every script the app offers intact", () => {
        it.each([
            ["Bulgarian", "Днес, здравей!"],
            ["German", "Verwirrung, größer, weiß"],
            ["Spanish, which opens as well as closes", "¿Qué? ¡Vamos!"],
            ["Greek, ano teleia U+0387", "Καλά· τι;"],
            ["Greek, normalised to the middle dot U+00B7", "Καλά· τι;"],
            ["Chinese", "你好，世界。"],
            ["Japanese, with corner quotes", "「こんにちは、世界。」"],
            ["Korean", "안녕하세요, 세계!"],
            ["Arabic", "مرحبا، كيف حالك؟"],
            ["Persian", "سلام۔"],
            ["Hebrew, maqaf and gershayim", "בית־ספר צה״ל"],
            ["Hindi", "नमस्ते।"],
            ["Bengali", "নমস্কার।"],
            ["Armenian", "Բարև՝ ինչպե՞ս ես։"],
            ["Thai", "สวัสดี ๆ ฯ"],
            ["Tamil", "வணக்கம்!"],
            ["Georgian", "გამარჯობა!"],
            ["Vietnamese", "Tiếng Việt, xin chào!"],
        ])("%s", (_label, sentence) => {
            expect(speakableText(sentence)).toBe(sentence);
        });

        // An accent stored as its own character rather than baked into the
        // letter. Any rule that forgets \p{M} silently turns "été" into "ete".
        it("does not peel a combining accent off its letter", () => {
            expect(speakableText("été")).toBe("été");
        });
    });

    describe("treats numbers as numbers", () => {
        it("keeps digits", () => {
            expect(speakableText("20 Grad, 1984")).toBe("20 Grad, 1984");
        });

        // A voice reads this "one half", so it is a word, not a symbol.
        it("keeps a fraction", () => {
            expect(speakableText("½ Liter")).toBe("½ Liter");
        });
    });

    describe("the shape of what comes out", () => {
        // A space rather than nothing: deleting the slash gives "andor",
        // which no voice can say.
        it("replaces a removed character with a space", () => {
            expect(speakableText("and/or")).toBe("and or");
            expect(speakableText("snake_case")).toBe("snake case");
        });

        it("collapses the runs of spaces that leaves behind", () => {
            expect(speakableText("Das ist **wichtig**")).toBe("Das ist wichtig");
            expect(speakableText("| Wort | Genus |")).toBe("Wort Genus");
        });

        // A line break is a pause worth keeping, and several callers hand
        // over more than one line at a time.
        it("keeps newlines", () => {
            expect(speakableText("Eins.\nZwei.")).toBe("Eins.\nZwei.");
        });

        // Currency goes with the rest of the symbols, which is the one place
        // this removes meaning rather than noise: the amount survives, the
        // word "euro" does not. Written down as a decision, not an accident.
        it("drops a currency symbol and leaves the amount", () => {
            expect(speakableText("Das kostet 20 €.")).toBe("Das kostet 20 .");
        });
    });

    describe("the empty-text guard", () => {
        // Shadowing chains its repeats on the utterance's `onend` event, and
        // an utterance with no words does not reliably fire it. Saying
        // "asterisk asterisk" is a poor outcome; a Play button that silently
        // does nothing is a worse one.
        it("falls back to the original when nothing speakable is left", () => {
            expect(speakableText("***")).toBe("***");
            expect(speakableText("###")).toBe("###");
        });

        it("leaves empty text empty", () => {
            expect(speakableText("")).toBe("");
        });
    });
});
