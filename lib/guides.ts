import { FEATURE_SECTIONS, STANDALONE_FEATURES } from "./feature-sections";

// Which page has which text guide (Question 52, chapter C). They replace the
// how-to videos, which were never recorded: an app that changes every week
// needs guides that cost one line to correct, not a video to re-record.
//
// Only the page-to-guide list lives here, because the pill that opens a
// guide is on every page and reads it there. The text itself is in
// lib/guide-texts.ts, which is loaded only when someone opens a guide.
//
// A list of its own rather than a field on each tool in feature-sections.ts,
// because the two don't line up one to one: the six Notes pages are one
// component and share one guide, the two sides of Flashcards likewise, and
// the home page has a guide without being a tool. A page with no line here
// simply shows no pill. The test beside this file is what stops a new tool
// from being added there and forgotten here.

// Page address → the guide's title, which is also how the guide is found
// in lib/guide-texts.ts. Keys are matched exactly, so sub-pages (a
// Flashcards review, an Unmemorized list) and the section pages get nothing
// without needing to be listed as exceptions.
export const GUIDE_PAGES: Record<string, string> = {
    "/": "Getting Started",

    "/reading/parallel-translate": "Parallel Translate",
    "/reading/inline-translate": "Inline Translate",

    "/writing/writing-check": "Writing Check",
    "/writing/chat": "Chat",

    "/vocabulary/word-list": "Word List",
    "/vocabulary/shuffle": "Flashcards",
    "/vocabulary/shuffle/phrases": "Flashcards",

    "/listening/parallel-listen": "Parallel Listen",
    "/listening/inline-listen": "Inline Listen",

    "/speaking/voice-chat": "Voice Chat",
    "/speaking/shadowing": "Shadowing Practice",

    "/notes": "Notes",
    "/reading/notes": "Notes",
    "/writing/notes": "Notes",
    "/vocabulary/notes": "Notes",
    "/listening/notes": "Notes",
    "/speaking/notes": "Notes",
};

export function guideTitle(pathname: string): string | undefined {
    return Object.hasOwn(GUIDE_PAGES, pathname) ? GUIDE_PAGES[pathname] : undefined;
}

export interface GuideGroup {
    label: string;
    titles: string[];
}

// The "All guides" list in the guide window, grouped and ordered like the
// header menu, so a guide is found where its tool is. Read from
// feature-sections.ts rather than written out again, so a tool moved or
// added there moves here too.
//
// A guide shared with a page of its own — Notes, which every section also
// has — is listed once, under that page, rather than under every section.
export function guideGroups(): GuideGroup[] {
    const ownPage = new Set(
        STANDALONE_FEATURES.map((feature) => guideTitle(feature.href)).filter(Boolean),
    );
    const sections = FEATURE_SECTIONS.map((section) => ({
        label: section.label,
        titles: [
            ...new Set(
                section.tools
                    .map((tool) => guideTitle(tool.href))
                    .filter((title): title is string => !!title && !ownPage.has(title)),
            ),
        ],
    }));
    const standalone = STANDALONE_FEATURES.map((feature) => ({
        label: feature.label,
        titles: [guideTitle(feature.href)].filter((title): title is string => !!title),
    }));
    return [
        { label: "Start here", titles: [guideTitle("/")].filter((title): title is string => !!title) },
        ...sections,
        ...standalone,
    ].filter((group) => group.titles.length > 0);
}
