// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    readParallelTranslateDraft,
    writeParallelTranslateDraft,
    type ParallelTranslateDraft,
} from "./parallel-translate-draft";

// What comes back when you return to Parallel Translate in the same tab.
// Restoring the wrong thing is worse than restoring nothing: a stale or
// broken draft would put text on the page that you never typed.

const draft: ParallelTranslateDraft = {
    columns: [
        { name: "English", text: "I am tired.", collapsed: false },
        { name: "German", text: "Ich bin müde.", collapsed: true },
    ],
    outputFormat: "vertical",
    result: {
        text: "- English: I am tired.\n- German: Ich bin müde.\n\n",
        rows: [["I am tired.", "Ich bin müde."]],
        names: ["English", "German"],
    },
};

beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
});

describe("the Parallel Translate draft", () => {
    it("gives back exactly what was written", () => {
        writeParallelTranslateDraft(draft);
        expect(readParallelTranslateDraft()).toEqual(draft);
    });

    it("is nothing when nothing was written", () => {
        expect(readParallelTranslateDraft()).toBeNull();
    });

    // What Clear leaves behind. Treated as no draft, so the page opens as
    // for a first visit, with the default language back in column one.
    it("treats empty columns and no result as nothing to restore", () => {
        writeParallelTranslateDraft({
            columns: [
                { name: "", text: "", collapsed: false },
                { name: "", text: "  ", collapsed: false },
            ],
            outputFormat: "markdown",
            result: null,
        });
        expect(readParallelTranslateDraft()).toBeNull();
    });

    it("ignores a draft it can't read, instead of breaking the page", () => {
        window.sessionStorage.setItem("parallel-translate:draft", "{not json");
        expect(readParallelTranslateDraft()).toBeNull();
        window.sessionStorage.setItem("parallel-translate:draft", JSON.stringify({ columns: "x" }));
        expect(readParallelTranslateDraft()).toBeNull();
    });

    it("drops a damaged result but keeps the columns", () => {
        window.sessionStorage.setItem(
            "parallel-translate:draft",
            JSON.stringify({ ...draft, result: { text: "x", rows: [[1, 2]], names: [] } }),
        );
        const restored = readParallelTranslateDraft();
        expect(restored?.columns).toHaveLength(2);
        expect(restored?.result).toBeNull();
    });

    // A full store must cost only this one save, never the page.
    it("doesn't throw when the browser refuses to store it", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });
        expect(() => writeParallelTranslateDraft(draft)).not.toThrow();
    });
});
