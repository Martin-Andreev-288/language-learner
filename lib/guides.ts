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
//
// Three guides for now (C1), so the format, length and tone can be judged
// on real pages before the other ten are written (C2).
export const GUIDE_PAGES: Record<string, string> = {
    "/reading/parallel-translate": "Parallel Translate",
    "/writing/writing-check": "Writing Check",
    "/speaking/shadowing": "Shadowing Practice",
};

export function guideTitle(pathname: string): string | undefined {
    return Object.hasOwn(GUIDE_PAGES, pathname) ? GUIDE_PAGES[pathname] : undefined;
}
