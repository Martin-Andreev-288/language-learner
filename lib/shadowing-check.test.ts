import { describe, it, expect } from "vitest";
import { isWordPerfect, normalizeForComparison } from "./shadowing-check";

// isWordPerfect decides whether a shadowing attempt is checked by the model
// at all. Wrong in one direction, it spends a request from the daily
// allowance on an attempt that was already right. Wrong in the other, it
// tells someone they said the sentence perfectly when they didn't — and no
// model ever sees the attempt to say otherwise.

describe("normalizeForComparison", () => {
    it("ignores case and the punctuation the recogniser adds or leaves out", () => {
        expect(normalizeForComparison("Guten Tag!")).toBe("guten tag");
    });

    it("strips the inverted Spanish marks and guillemets as well", () => {
        expect(normalizeForComparison("¡Hola! ¿Qué tal?")).toBe("hola qué tal");
        expect(normalizeForComparison("«Bonjour»")).toBe("bonjour");
    });

    it("lowercases Cyrillic and Greek, not only Latin", () => {
        expect(normalizeForComparison("ПРИВЕТ, МИР!")).toBe("привет мир");
        expect(normalizeForComparison("ΓΕΙΑ ΣΟΥ")).toBe("γεια σου");
    });

    // An accent is something you can say, so it has to survive: "más" and
    // "mas" are different words, and so are "año" and "ano".
    it("keeps accents and other marks on letters", () => {
        expect(normalizeForComparison("Más mañana")).toBe("más mañana");
        expect(normalizeForComparison("más")).not.toBe(
            normalizeForComparison("mas"),
        );
    });

    it("turns a hyphen into a space, the way the recogniser writes it", () => {
        expect(normalizeForComparison("well-known")).toBe(
            normalizeForComparison("well known"),
        );
    });

    it("treats an elided apostrophe like a space", () => {
        expect(normalizeForComparison("l'eau")).toBe("l eau");
        expect(normalizeForComparison("l’eau")).toBe("l eau");
    });

    it("collapses and trims whitespace, line breaks included", () => {
        expect(normalizeForComparison("  so \n  geht\tdas  ")).toBe("so geht das");
    });

    it("leaves nothing of a string that is only punctuation", () => {
        expect(normalizeForComparison("…!?")).toBe("");
    });
});

describe("isWordPerfect", () => {
    it("accepts the sentence exactly as written", () => {
        expect(isWordPerfect("Ich gehe nach Hause.", "Ich gehe nach Hause.")).toBe(true);
    });

    it("accepts it without the case and punctuation nobody can say", () => {
        expect(isWordPerfect("Ich gehe nach Hause.", "ich gehe nach hause")).toBe(true);
        expect(isWordPerfect("¿Dónde está la estación?", "dónde está la estación")).toBe(
            true,
        );
    });

    it.each([
        ["a word left out", "ich gehe Hause"],
        ["a word changed", "ich gehe nach Haus"],
        ["a word added", "ich gehe jetzt nach Hause"],
        ["the words reordered", "nach Hause gehe ich"],
    ])("rejects %s", (_label, attempt) => {
        expect(isWordPerfect("Ich gehe nach Hause.", attempt)).toBe(false);
    });

    it("rejects a missing accent", () => {
        expect(isWordPerfect("Quiero más.", "quiero mas")).toBe(false);
    });

    // Without the length check, two empty strings would compare equal, and
    // an empty target would hand out "word for word" for saying nothing.
    it("never matches when the target has nothing to say", () => {
        expect(isWordPerfect("", "")).toBe(false);
        expect(isWordPerfect("…", "")).toBe(false);
        expect(isWordPerfect("  ", "anything")).toBe(false);
    });

    it("rejects an empty attempt", () => {
        expect(isWordPerfect("Ich gehe nach Hause.", "")).toBe(false);
    });
});
