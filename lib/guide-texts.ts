// The text of each guide (Question 52, chapter C), found by the title
// lib/guides.ts gives a page. Loaded only when a guide is opened, so the
// pages themselves carry none of it.
//
// Every guide has the same shape, so people learn to read them once: one
// line on what the page is for, the steps, then what is good to know. Each
// line is drawn as Markdown, so a button's name can be **bold**.
//
// How they're written, so they stay true as the app changes:
// - the labels exactly as they are on the buttons;
// - what the page is for and its main steps, not every control;
// - no "top right" or "the second box", which break when the layout moves;
// - short enough to read on a phone without much scrolling.
// When a change alters a page's buttons or steps, its guide changes in the
// same commit. The test can only catch a guide that's missing, not one
// that's wrong.

export interface GuideText {
    // One line: what the page is for.
    purpose: string;
    // How to use it: 3 to 7 steps, naming the real buttons.
    steps: string[];
    // Good to know: 2 to 4 short points.
    tips: string[];
}

export const GUIDE_TEXTS: Record<string, GuideText> = {
    "Parallel Translate": {
        purpose:
            "See the same passage in two or more languages side by side, sentence by sentence.",
        steps: [
            "Paste the passage into the first box and name its language.",
            "For every other language, paste its translation — or press **+ Add language**, name it, and let **Translate empty columns with AI** fill it in.",
            "Press **Align sentences**. The sentences appear in a **Table** below; **Vertical** shows each group one under the other.",
            "Click a sentence to hear it read in its column's language, and click it again to stop.",
            "**Copy** the result, or **Save to a new note** to keep it in your Reading notes.",
        ],
        tips: [
            "Sentences are split at . ! ? and line breaks, so an abbreviation can cut a sentence in two. Fix it in the box and align again.",
            "Name every column: an unnamed one is read in your browser's default voice.",
            "A column's header moves it, folds it away or removes it.",
            "**Send to Parallel Listen →** takes the same texts there, to hear the languages one after another.",
        ],
    },

    "Writing Check": {
        purpose:
            "Write, paste or dictate a text, and get each mistake with a correction and the reason for it.",
        steps: [
            "Write or paste your text into the box.",
            "To dictate instead, choose the **Language**, press **Dictate**, speak, then press **Stop**. Fix anything it misheard.",
            "Press **Check**.",
            "In the **Result**, each mistake is marked and numbered in your text, with its correction and why below. Click a mark to find its explanation.",
            "**Fully corrected** is the whole text without mistakes; tick **Show changes** to see what changed.",
            "**Save to a new note** keeps the mistakes and the corrected text in your Writing notes.",
        ],
        tips: [
            "The language is optional for the check, which works it out itself. Dictation needs it, to know what to listen for.",
            "Dictation hears your words, not how you said them. For feedback on sounds, use **Shadowing Practice**.",
            "Up to 6,000 characters at a time.",
        ],
    },

    "Shadowing Practice": {
        purpose:
            "Hear a passage one sentence at a time, say each sentence back, and find out how it went.",
        steps: [
            "Paste a passage into the box, or press **Generate** for one written for you. **Options** sets its level, topic and length.",
            "Choose its **Language** and press **Start practicing**.",
            "Press **▶ Play** to hear the sentence. **Speed** and **Repeat** change how it's read.",
            "Press **Record your attempt**, say the sentence, then press **Stop recording**. Your attempt is checked as soon as you stop.",
            "Read what came back, then press **Continue →** — or move with **← Previous** and **Next →**.",
        ],
        tips: [
            "The check listens to how you sounded, not only to the words, and lists the sounds that came out wrong.",
            "Tap a word of the sentence to see its translation.",
            "**Auto-advance** plays each sentence, gives you the **Pause** you chose to say it, and moves on.",
            "Without an account you can paste, play and record. Generating, checking, looking words up and saving need one.",
        ],
    },
};
