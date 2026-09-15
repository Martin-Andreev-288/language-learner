// What this app contains, in one list (Question 379).
//
// Before this, the answer to "what tools does Speaking have?" was written
// down twice and neither copy was the page you landed on: the nav dropdown
// in components/shared/header/nav-links.tsx had the real list, the home page
// had its own array of section cards, and /speaking itself said the feature
// was coming soon — which stopped being true several features ago.
//
// So the list lives here and everything reads it: the header dropdowns, the
// home page cards, the five section pages, and each tool's own sign-in
// prompt. Adding a tool means adding a line here and nothing else, and
// there is no second copy left to forget.

export interface FeatureTool {
    href: string;
    // What the header dropdown calls it — short, because it sits under a
    // heading that already says which section you are in.
    label: string;
    // What it is called when it has to stand on its own, away from that
    // heading: "Sign in to access Reading Notes", not "access Notes".
    authName: string;
    description: string;
}

export interface FeatureSection {
    href: string;
    label: string;
    title: string;
    emoji: string;
    // Tailwind stops for the icon tile. Kept as the literal class fragment
    // rather than a colour name because that is what the home page cards
    // have always used, and inventing a palette layer to sit over five
    // hard-coded pairs would be more machinery than colours.
    gradient: string;
    description: string;
    // Empty for a feature that is a single page rather than a section —
    // see STANDALONE_FEATURES below.
    tools: FeatureTool[];
}

// The five sections that have more than one tool behind them, and so have a
// page worth landing on.
export const FEATURE_SECTIONS: FeatureSection[] = [
    {
        href: "/reading",
        label: "Reading",
        title: "Reading Practice",
        emoji: "📖",
        gradient: "from-[#667eea] to-[#764ba2]",
        description:
            "Translate passages, work through sentence lists, and keep notes on what you read.",
        tools: [
            {
                href: "/reading/shuffle",
                label: "Reading Shuffle",
                authName: "Reading Shuffle",
                description:
                    "Create sentence lists, group them by topics, and review them in randomized order.",
            },
            {
                href: "/reading/parallel-translate",
                label: "Parallel Translate",
                authName: "Parallel Translate",
                description:
                    "Paste the same passage in two or more languages and get it back aligned sentence by sentence.",
            },
            {
                href: "/reading/inline-translate",
                label: "Inline Translate",
                authName: "Inline Translate",
                description:
                    "Click the words you don't know in a pasted passage and get their translation inserted right next to them.",
            },
            {
                href: "/reading/notes",
                label: "Notes",
                authName: "Reading Notes",
                description: "Take notes on texts and dialogues you're reading.",
            },
        ],
    },
    {
        href: "/writing",
        label: "Writing",
        title: "Writing Practice",
        emoji: "✍️",
        gradient: "from-[#f093fb] to-[#f5576c]",
        description:
            "Check what you have written, practise in conversation, and keep notes as you go.",
        tools: [
            {
                href: "/writing/writing-check",
                label: "Writing Check",
                authName: "Writing Check",
                description:
                    "Paste or write something and get mistakes pointed out with a corrected version and an explanation.",
            },
            {
                href: "/writing/chat",
                label: "Chat",
                authName: "Chat",
                description:
                    "Practise a language by having a conversation — pick a language and start talking.",
            },
            {
                href: "/writing/notes",
                label: "Notes",
                authName: "Writing Notes",
                description:
                    "Take notes on grammar rules and phrasing for your writing practice.",
            },
        ],
    },
    {
        href: "/vocabulary",
        label: "Vocabulary",
        title: "Vocabulary",
        emoji: "📝",
        gradient: "from-[#4facfe] to-[#00f2fe]",
        description:
            "Keep every word you are learning in one place, and review it in randomized order.",
        tools: [
            {
                href: "/vocabulary/word-list",
                label: "Word List",
                authName: "Vocabulary",
                description:
                    "Keep every word you're learning in one list — add words yourself, or from other tools as they're built.",
            },
            {
                href: "/vocabulary/shuffle",
                label: "Vocab Shuffle",
                authName: "Vocabulary Shuffle",
                description:
                    "Create word lists, group them by topics, and review them in randomized order.",
            },
            {
                href: "/vocabulary/notes",
                label: "Notes",
                authName: "Vocabulary Notes",
                description:
                    "Take notes on words, phrases, and usage you want to remember.",
            },
        ],
    },
    {
        href: "/listening",
        label: "Listening",
        title: "Listening",
        emoji: "🎧",
        gradient: "from-[#30cfd0] to-[#330867]",
        description:
            "Listen to a passage sentence by sentence, in one language or several at once.",
        tools: [
            {
                href: "/listening/parallel-listen",
                label: "Parallel Listen",
                authName: "Parallel Listen",
                description:
                    "Paste the same passage in two or more languages and listen to only the ones you choose, sentence by sentence.",
            },
            {
                href: "/listening/inline-listen",
                label: "Inline Listen",
                authName: "Inline Listen",
                description:
                    "Paste a passage — or send one from Inline Translate — and listen to it sentence by sentence.",
            },
            {
                href: "/listening/notes",
                label: "Notes",
                authName: "Listening Notes",
                description: "Take notes on what you're listening to.",
            },
        ],
    },
    {
        href: "/speaking",
        label: "Speaking",
        title: "Speaking",
        emoji: "🗣️",
        gradient: "from-[#f6d365] to-[#fda085]",
        description:
            "Say it out loud and find out how it went — in conversation, or one sentence at a time.",
        tools: [
            {
                href: "/speaking/speak-check",
                label: "Speak Check",
                authName: "Speak Check",
                description:
                    "Say something in the language you're learning and get mistakes pointed out with a corrected version and an explanation.",
            },
            {
                href: "/speaking/voice-chat",
                label: "Voice Chat",
                authName: "Voice Chat",
                description:
                    "Practise a language by having a conversation out loud — pick a language and start talking.",
            },
            {
                href: "/speaking/shadowing",
                label: "Shadowing Practice",
                authName: "Shadowing Practice",
                description:
                    "Paste a passage and go through it one sentence at a time to practice repeating it out loud.",
            },
            {
                href: "/speaking/notes",
                label: "Notes",
                authName: "Speaking Notes",
                description:
                    "Take notes on pronunciation and phrasing for your speaking practice.",
            },
        ],
    },
];

// One page each, so there is nothing to land on and choose between. They
// appear on the home page beside the sections and in the header as plain
// links rather than as a label with a menu under it.
//
// A list of one, for now. It held the Vocabulary Analyzer too until
// Question 385 retired that feature; the shape is kept rather than folded
// into FEATURE_SECTIONS because the distinction it draws — a feature that
// is one page versus a section you choose within — is still real, and the
// header and home page both still branch on it.
export const STANDALONE_FEATURES: FeatureSection[] = [
    {
        href: "/notes",
        label: "Notes",
        title: "Notes",
        emoji: "📓",
        gradient: "from-[#fa709a] to-[#fee140]",
        description:
            "Every note from every tool, in one place — grammar, vocabulary, and anything else worth keeping.",
        tools: [],
    },
];

// Home page order, and header order after Home. One list so the two can't
// disagree about where Speaking sits.
export const ALL_FEATURES: FeatureSection[] = [
    ...FEATURE_SECTIONS,
    ...STANDALONE_FEATURES,
];

// Throws rather than returning undefined: every call site is a page passing
// its own literal path, so a miss means the path was mistyped and the page
// would otherwise render an empty shell that looks deliberate.
export function featureSection(href: string): FeatureSection {
    const section = FEATURE_SECTIONS.find((item) => item.href === href);
    if (!section) {
        throw new Error(`No feature section is registered for "${href}".`);
    }
    return section;
}

// Looks through every section's tools. Used by the tool pages themselves so
// a tool's description is written once and shown both on the card that
// links to it and in its own sign-in prompt.
export function featureTool(href: string): FeatureTool {
    for (const section of FEATURE_SECTIONS) {
        const tool = section.tools.find((item) => item.href === href);
        if (tool) return tool;
    }
    throw new Error(`No feature tool is registered for "${href}".`);
}
