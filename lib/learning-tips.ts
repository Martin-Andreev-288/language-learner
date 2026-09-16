// Tips shown in the strip above the header (Question 387, list Question 388).
//
// Grouped by theme in comments even though the array itself is flat — a
// list this size is easier to review and extend a section at a time than
// as one undifferentiated block, the same reason
// lib/title-abbreviations.ts breaks its list up by language rather than
// alphabetising everything into one run.
//
// Each one holds to the rule set out when this file was created: short
// enough to be read by accident on the way to somewhere else. None of
// these are app instructions — nothing here says "try Shadowing" or "use
// Vocab Shuffle". They're general advice, the same kind a quote banner
// would carry, not a nudge toward a feature.
export const LEARNING_TIPS: string[] = [
    // --- Consistency ---
    "A short session every day beats a long one once a week — the gap is what you forget in.",
    "Consistency beats intensity. Twenty minutes you actually do beats two hours you keep postponing.",
    "A plateau usually isn't proof you've stopped improving — it's often a sign progress has moved somewhere you can't measure yet.",
    "The learner who kept going for a year beats the learner who studied hard for a month. Almost any method works if you stay with it.",

    // --- Input: reading and listening ---
    "Reading and listening build recognition. Only speaking and writing build recall — do some of both.",
    "You don't need to understand every word to understand a sentence. Context carries more than vocabulary does.",
    "Listen to something slightly above your level. Comfortable material teaches you nothing new; incomprehensible material teaches you nothing at all.",
    "Meet a grammar pattern in real sentences before you read the rule for it — the rule makes more sense once you've already felt the shape of it.",
    "Subtitles in your target language teach reading. Subtitles in your own language mostly teach you to stop listening.",

    // --- Output: speaking and writing ---
    "Say it out loud, even alone. A phrase your mouth has never made is one it can't find later in conversation.",
    "Being understood comes before sounding native. Aim for clear, not perfect.",
    "A mistake you make out loud and get corrected on is worth more than ten you avoided by staying silent.",
    "Record yourself speaking occasionally. What you hear back rarely matches what you thought you sounded like.",
    "The longer you wait to speak in a conversation, the more you're practicing not speaking.",
    "Shadow native speakers: repeat right behind them, matching rhythm and stress before worrying about individual sounds. Pronunciation is closer to music than to phonetics.",

    // --- Vocabulary ---
    "Learn words in the company they keep. \"Make a decision\" is one thing to learn, not two.",
    "Recognizing a word and producing it are different skills — most vocabulary lives in the first state a long time before it reaches the second.",
    "Ten words you actually use beat a hundred you only recognize.",
    "Translate as little as possible. Routing a word through your first language practices the detour, not the destination.",
    "A small set of high-frequency words carries most of everyday speech — learn those before chasing the interesting rare ones.",

    // --- Grammar ---
    "Grammar describes a language — it isn't a prerequisite for speaking it. Children manage the second part long before the first.",
    "Perfect grammar with nothing to say is less useful than broken grammar with something worth saying.",

    // --- Mistakes and mindset ---
    "Fluent speakers still make mistakes in their own language. The goal was never zero errors — it's being understood despite them.",
    "Discomfort during practice usually means you're at the right level, not the wrong one.",
    "Motivation gets you started. A routine is what gets you through the weeks motivation forgets to show up.",
    "Compare yourself to where you were, not to a native speaker — those are different races.",

    // --- Real language, not textbook language ---
    "Textbook dialogue and real conversation share a grammar but not much else. Real speech interrupts itself, trails off, and repeats.",
    "Learn the phrase people actually say, not the one that's easiest to build from rules — a natural greeting beats a grammatically perfect one nobody uses.",
    "Slang and informal speech aren't a lesser form of a language — they're the form most people actually speak in.",

    // --- Strategy ---
    "A clear plan for this week beats a vague ambition to \"get better\" — vague goals tend to produce vague effort.",
    "Pick one thing to focus on per session. Grammar, vocabulary, and pronunciation all at once usually means none of them get real attention.",
    "Track what you've done, not just what you know. A record of effort survives a bad week better than a feeling of progress does.",

    // --- Culture ---
    "A language carries the culture that built it. An idiom often makes more sense once you know what problem it was solving.",
    "Humor is one of the last things to transfer well between languages — if a joke doesn't land, that's not a sign you're behind.",

    // --- Making it part of the day ---
    "Change the language on your phone or the apps you already use daily. Repetition you don't have to schedule is the cheapest kind there is.",
    "Rehearse a sentence in your head in your target language before you actually need to say it — rehearsal off-stage is still practice.",
    "Study what you'd want to consume anyway — a show, a hobby, a person. Interest sustains practice longer than discipline does.",

    // --- The long view ---
    "Fluency is a direction, not a destination you arrive at and stop needing to travel toward.",

    // --- Memory and review ---
    "A word you meet once doesn't stick — it's the fifth or sixth encounter, spaced across days, that turns exposure into memory.",
    "Review what you're about to forget, not what you already know. Revisiting easy material feels productive but teaches nothing new.",
];

// Picks a tip, never the one already on screen.
//
// Pure randomness would repeat — with only a handful of tips that was a
// real chance every time, which reads as the feature being broken rather
// than as chance. Excluding the current one costs a line and removes the
// only way this looks wrong. Kept even now that the list is long enough
// that a repeat would be rare, since there's no reason to remove a guard
// that costs nothing to keep.
export function pickTip(current?: string): string {
    const pool =
        current && LEARNING_TIPS.length > 1
            ? LEARNING_TIPS.filter((tip) => tip !== current)
            : LEARNING_TIPS;

    return pool[Math.floor(Math.random() * pool.length)];
}
