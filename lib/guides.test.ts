import { describe, it, expect } from "vitest";
import { GUIDE_PAGES, guideTitle } from "./guides";
import { GUIDE_TEXTS } from "./guide-texts";
import { FEATURE_SECTIONS, STANDALONE_FEATURES } from "./feature-sections";
import { SHUFFLE_SIDES } from "./shuffle-sides";

// The guide list is written separately from feature-sections.ts on purpose
// (see the top of guides.ts), which means the one failure it invites is a
// silent one: a tool added there and never here simply shows no guide, and
// nothing else would ever say so. This is the check that would — and the
// check that every guide a page names is written, in the same shape.

// Tools that deliberately have no guide. Word Translate is local-only and
// is never deployed, so there is no page for a guide to sit on.
const NO_GUIDE = ["/reading/word-translate"];

// Written in the next iteration (C2). Until then these pages show no pill.
// Each comes off this list as its guide is written, and the list goes with
// the last one.
const NOT_WRITTEN_YET = [
    "/reading/inline-translate",
    "/writing/chat",
    "/vocabulary/word-list",
    "/vocabulary/shuffle",
    "/listening/parallel-listen",
    "/listening/inline-listen",
    "/speaking/voice-chat",
    "/notes",
    "/reading/notes",
    "/writing/notes",
    "/vocabulary/notes",
    "/listening/notes",
    "/speaking/notes",
];

const pageHrefs = [
    ...FEATURE_SECTIONS.flatMap((section) => section.tools.map((tool) => tool.href)),
    ...STANDALONE_FEATURES.map((feature) => feature.href),
];

describe("GUIDE_PAGES", () => {
    it("names a guide for every tool page that isn't exempted or still to write", () => {
        const missing = pageHrefs.filter(
            (href) =>
                !NO_GUIDE.includes(href) && !NOT_WRITTEN_YET.includes(href) && !(href in GUIDE_PAGES),
        );
        expect(missing).toEqual([]);
    });

    it("keeps the still-to-write list honest: real tool pages, none with a guide already", () => {
        expect(NOT_WRITTEN_YET.filter((href) => !pageHrefs.includes(href))).toEqual([]);
        expect(NOT_WRITTEN_YET.filter((href) => href in GUIDE_PAGES)).toEqual([]);
    });

    it("only lists real pages, so a mistyped address can't hide", () => {
        // The phrases side of Flashcards is a real page without being a tool
        // of its own, so it is added here rather than counted as a typo.
        const known = new Set([
            "/",
            ...pageHrefs,
            ...Object.values(SHUFFLE_SIDES).map((side) => side.href),
        ]);
        expect(Object.keys(GUIDE_PAGES).filter((href) => !known.has(href))).toEqual([]);
    });

    it("names only guides that are written, and every written guide is on a page", () => {
        const named = new Set(Object.values(GUIDE_PAGES));
        expect([...named].filter((title) => !(title in GUIDE_TEXTS))).toEqual([]);
        expect(Object.keys(GUIDE_TEXTS).filter((title) => !named.has(title))).toEqual([]);
    });
});

describe("GUIDE_TEXTS", () => {
    // The shape every guide shares, so people learn to read them once.
    it.each(Object.entries(GUIDE_TEXTS))("%s has the shared shape", (_title, guide) => {
        expect(guide.purpose.trim()).not.toBe("");
        expect(guide.purpose).not.toContain("\n");
        expect(guide.steps.length).toBeGreaterThanOrEqual(3);
        expect(guide.steps.length).toBeLessThanOrEqual(7);
        expect(guide.tips.length).toBeGreaterThanOrEqual(2);
        expect(guide.tips.length).toBeLessThanOrEqual(4);
        expect([...guide.steps, ...guide.tips].filter((line) => !line.trim())).toEqual([]);
    });
});

describe("guideTitle", () => {
    it("matches the address exactly", () => {
        expect(guideTitle("/speaking/shadowing")).toBe("Shadowing Practice");
        // A sub-page or a section page gets no pill of its own.
        expect(guideTitle("/speaking/shadowing/extra")).toBeUndefined();
        expect(guideTitle("/speaking")).toBeUndefined();
    });

    it("does not mistake an inherited property for a page", () => {
        expect(guideTitle("constructor")).toBeUndefined();
        expect(guideTitle("toString")).toBeUndefined();
    });
});
