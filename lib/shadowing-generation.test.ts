import { describe, it, expect } from "vitest";
import {
    DEFAULT_SHADOWING_LENGTH,
    DEFAULT_SHADOWING_REGISTER,
    DEFAULT_SHADOWING_SENTENCE_LENGTH,
    describeShadowingOptions,
} from "./shadowing-generation";

// With its fields folded away, this line is the only place the generator's
// settings are visible. If it says something other than what Generate will
// ask for, you find out only after spending a request on the wrong passage.

const defaults = {
    level: "",
    register: DEFAULT_SHADOWING_REGISTER,
    length: DEFAULT_SHADOWING_LENGTH,
    sentenceLength: DEFAULT_SHADOWING_SENTENCE_LENGTH,
    topic: "",
};

describe("describeShadowingOptions", () => {
    it("describes the untouched form", () => {
        expect(describeShadowingOptions(defaults)).toEqual([
            "Any level",
            "Everyday conversation",
            "Medium passage",
            "Medium sentences",
        ]);
    });

    // "Medium · Short" alone would leave you guessing which length is which.
    it("says what each length measures", () => {
        expect(
            describeShadowingOptions({
                ...defaults,
                level: "A2",
                length: "short",
                sentenceLength: "long",
            }),
        ).toEqual(["A2", "Everyday conversation", "Short passage", "Long sentences"]);
    });

    it("adds the topic in quotes, and only when there is one", () => {
        expect(describeShadowingOptions({ ...defaults, topic: "  " })).toHaveLength(4);
        expect(
            describeShadowingOptions({ ...defaults, topic: " ordering at a bakery " }).at(-1),
        ).toBe("“ordering at a bakery”");
    });

    it("shortens a long topic instead of letting it run on", () => {
        const topic = "keep it in the past tense and use lots of separable verbs";
        const shown = describeShadowingOptions({ ...defaults, topic }).at(-1)!;
        expect(shown.length).toBeLessThanOrEqual(42);
        expect(shown).toMatch(/^“keep it in the past tense.*…”$/);
    });
});
