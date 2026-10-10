import { describe, it, expect } from "vitest";
import { VIDEO_GUIDES, videoGuideTitle } from "./video-guides";
import { FEATURE_SECTIONS, STANDALONE_FEATURES } from "./feature-sections";

// The video list is written separately from feature-sections.ts on purpose
// (see the top of video-guides.ts), which means the one failure it invites
// is a silent one: a tool added there and never here simply shows no video
// link, and nothing else would ever say so. This is the check that would.

// Tools that deliberately have no video. Word Translate is local-only and is
// never deployed, so there is no page for a link to sit on.
const NO_VIDEO = ["/reading/word-translate"];

const pageHrefs = [
    ...FEATURE_SECTIONS.flatMap((section) =>
        section.tools.map((tool) => tool.href),
    ),
    ...STANDALONE_FEATURES.map((feature) => feature.href),
];

describe("VIDEO_GUIDES", () => {
    it("names a video for every tool page that isn't exempted", () => {
        const missing = pageHrefs.filter(
            (href) => !NO_VIDEO.includes(href) && !(href in VIDEO_GUIDES),
        );
        expect(missing).toEqual([]);
    });

    it("only lists real pages, so a mistyped address can't hide", () => {
        const known = new Set(["/", ...pageHrefs]);
        const unknown = Object.keys(VIDEO_GUIDES).filter(
            (href) => !known.has(href),
        );
        expect(unknown).toEqual([]);
    });

    it("never has an empty title", () => {
        const empty = Object.entries(VIDEO_GUIDES)
            .filter(([, title]) => !title.trim())
            .map(([href]) => href);
        expect(empty).toEqual([]);
    });
});

describe("videoGuideTitle", () => {
    it("matches the address exactly", () => {
        expect(videoGuideTitle("/vocabulary/shuffle")).toBe("Shuffle");
        // A review session lives under the dashboard's address but gets no
        // link of its own — the place a link would most get in the way.
        expect(videoGuideTitle("/vocabulary/shuffle/review/abc")).toBeUndefined();
        expect(videoGuideTitle("/reading")).toBeUndefined();
    });

    it("does not mistake an inherited property for a page", () => {
        expect(videoGuideTitle("constructor")).toBeUndefined();
        expect(videoGuideTitle("toString")).toBeUndefined();
    });
});
