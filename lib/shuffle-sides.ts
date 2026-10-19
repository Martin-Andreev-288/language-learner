// The two sides of Shuffle — words and phrases — in one place: where each
// lives, what its switch button says, and what its page is headed.
//
// They are one screen told which kind of list to show (every list, folder
// and card carries its own kind in the database), and since the phrases side
// moved from Reading into Vocabulary they sit under one menu entry. Every
// link to either side is built from here, so a side that moves again is one
// line here rather than a search through the app for its old address.
export const SHUFFLE_SIDES = {
    word: {
        label: "Words",
        heading: "Vocab Shuffle",
        href: "/vocabulary/shuffle",
    },
    phrase: {
        label: "Phrases",
        heading: "Phrase Shuffle",
        href: "/vocabulary/shuffle/phrases",
    },
} as const;

export type ShuffleSide = keyof typeof SHUFFLE_SIDES;

export function shuffleReviewBasePath(side: ShuffleSide): string {
    return `${SHUFFLE_SIDES[side].href}/review`;
}
