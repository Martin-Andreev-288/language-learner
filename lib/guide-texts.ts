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
    "Getting Started": {
        purpose:
            "Tools for practising a language: reading, writing, vocabulary, listening and speaking.",
        steps: [
            "Choose a section on this page or in the menu, then one of its tools.",
            "Every tool has a **? Guide** like this one, with its own steps. **All guides** below lists them all.",
            "Signed in, this page starts with **Continue**: the Flashcards lists due today, and the tool you used last.",
            "Words you meet in a tool can go to your **Word List**, and from there to **Flashcards**.",
            "Each section keeps its own **Notes**; **Notes** in the menu holds everything else.",
        ],
        tips: [
            "Most tools need a free account. **Shadowing Practice** works without one, so you can try it first.",
            "In many tools you can tap or click a word to see its translation, with its definition one press away.",
            "The AI behind the checks and translations has a daily limit shared by everyone using the app. If a tool says it's reached, try again the next day.",
        ],
    },

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

    "Inline Translate": {
        purpose:
            "Read a passage in another language and get the words you don't know translated right beside them.",
        steps: [
            "Paste the passage into the box.",
            "Under **Translate marked words into**, add the languages you want, up to 4.",
            "Click or tap the words you don't know to mark them, then press **Translate marked words**.",
            "The **Result** shows each translation beside its word; **Hide translations** reads the passage without them.",
            "**Add all to vocabulary** keeps the words. **Save to a new note**, **Copy** and **Send to Inline Listen →** take the passage further.",
        ],
        tips: [
            "For one word on its own, right-click it — or press and hold on a phone — for a window with its translation, its definition and **+ Add to text**.",
            "Words marked next to each other are translated together, as one phrase.",
            "Set the **Source language**, so saved words are filed under it and Inline Listen reads in the right voice.",
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

    Chat: {
        purpose:
            "Practise a language by writing a conversation, with each message you send checked along the way.",
        steps: [
            "Choose the **Language**, write your first message, and press **Send**.",
            "The reply comes in that language. Talk about anything you like, and keep it going.",
            "A badge appears beside each message you send: **✓** means nothing to correct, a number means things to look at. Click it to see each mistake, its correction and why.",
            "Set **Translate into** to get a **Translate** button under each reply.",
            "Tap or click a word in a reply to see its translation, with its definition one press away.",
            "**Save to a new note** keeps the conversation and its feedback in your Writing notes. **New chat** starts over.",
        ],
        tips: [
            "The check never interrupts the conversation: its feedback waits behind the badge until you want it.",
            "Your conversation stays here if you go to another page and come back in the same tab.",
            "From a saved note, **Continue this conversation** brings it back to this page.",
        ],
    },

    "Word List": {
        purpose: "Every word you're learning, in one list you can search, sort and fill in.",
        steps: [
            "Under **Add words**, type or paste words, one per line, choose their **Language**, and press **Add**.",
            "Words also arrive from other tools: **Add all to vocabulary** in Inline Translate, and **+ Add to vocabulary** in the word window.",
            "Find words with the search box, **Filters** and **Sort**. **Table** shows more about each word at once than **List**.",
            "Tick words to select them, then press **Add information…** to have their translations, level, examples and more filled in.",
            "Or press **Send to Flashcards…** to practise the selected words as cards.",
            "In the **Table**, **Columns** chooses what is shown, and **Copy** copies it, ready to paste into a spreadsheet.",
        ],
        tips: [
            "**Add information…** takes up to 30 words at a time, with translations into up to 4 languages.",
            "Hold Shift while ticking to select every word back to the last one you ticked.",
            "Each word is kept under its language, so the same word in two languages is two words.",
        ],
    },

    Flashcards: {
        purpose: "Lists of words or phrases to go through one card at a time, in random order.",
        steps: [
            "Choose **Words** or **Phrases**, press **Add new list**, give it a title and paste its items, one per line.",
            "Press a list to review it. **Next** and **Previous** move between the cards.",
            "**Mark memorized** takes a card out of the **Unmemorized** ones; **Mark favorite** keeps it among the **Favorites**.",
            "At the end, press **Mark as reviewed**. The list comes due again after 1 day, then 3, 7, 14 and 30.",
            "**Review due** goes through every list due today in one session; **Review All** through all of them.",
            "Group lists with **New folder**, and tick several lists to **Review selected** together.",
        ],
        tips: [
            "On the phrases side, tap a word on a card to see its translation.",
            "Words from your **Word List** arrive here when you press **Send to Flashcards…** there.",
            "Signed in, the home page's **Continue** shows which lists are due today.",
        ],
    },

    "Parallel Listen": {
        purpose:
            "Hear the same passage in two or more languages, sentence by sentence or one language after another.",
        steps: [
            "Paste the passage into the first box and name its language. **+ Add language** adds a box for each of the others.",
            "Tick **Play** beside the languages you want to hear; the others are skipped.",
            "Choose the **Order**: **Sentence by sentence** reads each sentence in every language before the next, **Language by language** one whole text after another.",
            "Press **▶ Play**. **⏸ Pause** and **▶ Resume** keep your place, **■ Stop** ends it, and **Speed** changes how fast.",
            "Click a sentence in the **Preview** to start reading from there.",
            "**Save to a new note** keeps the texts in your Listening notes, for **Listen again** later.",
        ],
        tips: [
            "Name every box: the language picks the voice, and an unnamed one is read in your browser's default voice.",
            "The voices come from your browser and system, so a language may sound different, or have none, on another device.",
            "Coming from **Parallel Translate**? Its **Send to Parallel Listen →** fills this page in for you.",
        ],
    },

    "Inline Listen": {
        purpose: "Hear a passage read aloud sentence by sentence, in one language.",
        steps: [
            "Paste the passage, or send one here with **Send to Inline Listen →** in Inline Translate.",
            "Choose its **Language**, so it's read in a matching voice.",
            "Press **▶ Play**. **⏸ Pause** and **▶ Resume** keep your place, **■ Stop** ends it, and **Speed** changes how fast.",
            "Click a sentence to start reading from there.",
            "**Save to a new note** keeps the passage in your Listening notes, for **Listen again** later.",
        ],
        tips: [
            "A passage sent from Inline Translate keeps its translations on screen, but only the original words are read.",
            "The voices come from your browser and system, so a language may sound different, or have none, on another device.",
        ],
    },

    "Voice Chat": {
        purpose: "Practise a language by speaking a conversation: you talk, and it answers out loud.",
        steps: [
            "Choose the **Language**.",
            "Press **Dictate**, say your message, then press **Stop**. Fix anything it misheard in the box, and press **Send**.",
            "With **Read replies aloud** on, each reply is read to you. **Play again** repeats one, and **Speed** changes how fast.",
            "**Send when I stop talking** sends a dictated message by itself after a short pause.",
            "The badge beside each message you send opens its feedback, as in **Chat**. Tap a word in a reply to look it up.",
            "**Save to a new note** keeps the conversation and its feedback in your Speaking notes.",
        ],
        tips: [
            "After the reply to a message you dictated has been read, the microphone switches back on, so you can just keep talking.",
            "Your messages are checked from the words the browser writes down: what you say, not how you pronounce it. For sounds, use **Shadowing Practice**.",
            "You can type instead of speaking at any time. Dictation works in Chrome, Edge and Safari.",
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

    Notes: {
        purpose: "Notes on what you're learning, kept in folders and written with simple formatting.",
        steps: [
            "Press **New note**, give it a **Title**, write it, and press **Create**.",
            "**Preview** shows it formatted, and **Fullscreen** gives it the whole screen.",
            "In **Preview**, tap or click a word to see its translation.",
            "**New folder** makes a folder. Drag a note or a folder onto another folder to move it.",
            "Search, or change **Sort by**, to find a note, and press it to open it again.",
            "A note saved from another tool has a way back to it: **Listen again**, **Practice again** or **Continue this conversation**.",
        ],
        tips: [
            "Reading, Writing, Vocabulary, Listening and Speaking each keep their own notes. **Notes** in the menu is for everything else.",
            "Formatting is Markdown: `**bold**`, `*italic*`, `# Heading`, `- a list item`.",
            "Deleting a folder deletes everything in it.",
        ],
    },
};
