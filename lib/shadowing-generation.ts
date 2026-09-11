// The choices behind "generate a passage to practise" (Questions 357–359).
//
// These live here rather than in the action for the reason stated at the top
// of lib/vocabulary-enrichment.ts: a "use server" module may only export
// async functions, and exporting a plain constant from one strips the module
// of all its exports. An ordinary module lets the form that collects these
// and the action that acts on them read the same list.

// Every field is optional, and that's the design rather than leniency
// (Question 356): leaving one blank is a real answer — "no direction here" —
// and the passage is generated without it, not with some invented default
// standing in for a choice you didn't make.

// What the passage should sound like.
//
// One named list rather than two crossed ones — formality and
// dialogue-versus-prose both live in here together — for the same reason
// USED_IN_VALUES is one list: two independent dropdowns would offer
// combinations nobody wants (a formal slang announcement) and make you
// answer two questions where you were only thinking about one.
//
// Nine of them, deliberately more than the four this started as
// (Question 358). Named rather than a formality slider: "how formal, 1 to
// 10" invites a directionless answer, which is the same trouble a numeric
// scale caused when it was tried elsewhere in this app.
export const SHADOWING_REGISTERS = [
    "Everyday conversation",
    "Slang or very informal",
    "Formal conversation",
    "News broadcast",
    "Storytelling or simple narrative",
    "Narration",
    "Announcement or instructions",
    "Interview",
    "Debate or opinion",
] as const;

export type ShadowingRegister = (typeof SHADOWING_REGISTERS)[number];

// What each one means, for the model rather than for the reader — the same
// split USED_IN_HINTS keeps. A bare label like "Narration" leaves too much
// room; these say what shape the text should actually take.
export const SHADOWING_REGISTER_PROMPTS: Record<string, string> = {
    "Everyday conversation":
        "a casual spoken exchange between two people, the way friends or family actually talk",
    "Slang or very informal":
        "very casual current speech, with contractions and relaxed phrasing",
    "Formal conversation":
        "a polite or professional exchange between two people, the register of work or officialdom",
    "News broadcast":
        "a short news report as it would be read aloud on air — clear, measured, and paced for a listener",
    "Storytelling or simple narrative":
        "a simple story told aloud, plainly and unhurriedly, the way it would be told to someone rather than written for them",
    "Narration":
        "descriptive prose in a narrator's voice, not dialogue",
    "Announcement or instructions":
        "an announcement, a set of directions, or steps to follow",
    "Interview":
        "a short question-and-answer exchange between an interviewer and someone answering",
    "Debate or opinion":
        "someone arguing a position, making a case rather than describing",
};

// How long the passage runs. Named presets rather than a number field, the
// same reason Speed and Repeat on this page are dropdowns: a free number
// invites someone typing 50 and paying for a passage nobody was going to
// shadow sentence by sentence. Sentence counts, because shadowing is done
// one sentence at a time — this is really "how long is the practice
// session", not "how many words".
export const SHADOWING_LENGTHS = [
    { value: "short", label: "Short", sentences: "3 to 4" },
    { value: "medium", label: "Medium", sentences: "6 to 8" },
    { value: "long", label: "Long", sentences: "10 to 12" },
] as const;

export type ShadowingLength = (typeof SHADOWING_LENGTHS)[number]["value"];

// Used when nothing is chosen (Question 357). Conversational rather than
// formal isn't arbitrary: this is a speaking tool, and the natural spoken
// register is the more honest default than narration, which reads well on
// a page and sounds stilted out loud.
export const DEFAULT_SHADOWING_REGISTER: ShadowingRegister =
    "Everyday conversation";
export const DEFAULT_SHADOWING_LENGTH: ShadowingLength = "medium";

// The same A1–C2 scale the rest of the app already uses, rather than a
// second one invented here.
export const SHADOWING_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export interface ShadowingGenerationOptions {
    language?: string;
    level?: string;
    topic?: string;
    register?: string;
    length?: string;
}

export interface GeneratedPassage {
    passage: string;
    // Which language it actually came back in — needed rather than merely
    // nice, because leaving the language blank is allowed. Without it, a
    // passage generated with no language chosen would be spoken by whatever
    // voice the browser defaults to, which is the wrong one by definition.
    language: string;
}
