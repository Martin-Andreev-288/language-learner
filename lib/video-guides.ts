// Which video in the how-to playlist belongs to which page (video
// directions.md, Answers 2, 4 and 10 from file 'video directions.md').
//
// The app never links to a single video. It links to one playlist, and each
// page names the video to pick in it: `▶ video "Parallel Translate"`. That
// is what lets a video be deleted and re-uploaded under the same title
// without this file — or anything else in the app — changing at all. The
// one thing that does need a push is renaming or removing a page.
//
// A list of its own rather than a field on each tool in feature-sections.ts,
// because the two don't line up one to one: the six Notes pages are one
// component and share one video, the two sides of Shuffle likewise, and the
// home page has a video without being a tool. A tool with no line here
// simply shows no link. The test beside this file is what stops a new tool
// from being added there and forgotten here.

// Empty until the playlist exists. While it is, the strip still names the
// video but renders as plain text rather than a link — a link that goes
// nowhere is worse than none, and this is also what lets the videos be
// recorded against the deployed site before there is anything to link to.
// Filling this in is the whole of the follow-up: every page becomes a link
// at once.
export const VIDEO_PLAYLIST_URL = "";

// Page address → the video's title, written exactly as it is in the
// playlist. Keys are matched exactly, so sub-pages (a Shuffle review, an
// Unmemorized list) and the section pages get nothing without needing to be
// listed as exceptions.
export const VIDEO_GUIDES: Record<string, string> = {
    "/": "Getting Started",

    "/reading/parallel-translate": "Parallel Translate",
    "/reading/inline-translate": "Inline Translate",

    "/writing/writing-check": "Writing Check",
    "/writing/chat": "Chat",

    "/vocabulary/word-list": "Word List",
    "/vocabulary/shuffle": "Shuffle",
    "/vocabulary/shuffle/phrases": "Shuffle",

    "/listening/parallel-listen": "Parallel Listen",
    "/listening/inline-listen": "Inline Listen",

    "/speaking/speak-check": "Speak Check",
    "/speaking/voice-chat": "Voice Chat",
    "/speaking/shadowing": "Shadowing Practice",

    "/notes": "Notes",
    "/reading/notes": "Notes",
    "/writing/notes": "Notes",
    "/vocabulary/notes": "Notes",
    "/listening/notes": "Notes",
    "/speaking/notes": "Notes",
};

export function videoGuideTitle(pathname: string): string | undefined {
    return Object.hasOwn(VIDEO_GUIDES, pathname)
        ? VIDEO_GUIDES[pathname]
        : undefined;
}
