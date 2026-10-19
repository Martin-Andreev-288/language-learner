// The two sides of Flashcards — words and phrases — in one place: where each
// lives and what its switch button says. (The addresses still say "shuffle";
// only the name people see changed, so no link or redirect had to.)
//
// They are one screen told which kind of list to show (every list, folder
// and card carries its own kind in the database), and they sit under one menu
// entry. Both pages share that entry's name as their heading, so there is
// nothing per side to keep here. Every link to either side is built from
// here, so a side that moves again is one line here rather than a search
// through the app for its old address.
export const SHUFFLE_SIDES = {
    word: {
        label: "Words",
        href: "/vocabulary/shuffle",
    },
    phrase: {
        label: "Phrases",
        href: "/vocabulary/shuffle/phrases",
    },
} as const;

export type ShuffleSide = keyof typeof SHUFFLE_SIDES;

export function shuffleReviewBasePath(side: ShuffleSide): string {
    return `${SHUFFLE_SIDES[side].href}/review`;
}
