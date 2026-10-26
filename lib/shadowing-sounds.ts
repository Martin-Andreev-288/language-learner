import { z } from "zod";
import { SHADOWING_ATTEMPT_MAX_CHARACTERS, SHADOWING_SOUNDS_MAX_BYTES } from "./limits";
import { looksLikeWav } from "./wav";
import { isWordPerfect, type ShadowingDifference } from "./shadowing-check";

// Shadowing's sounds check (item 10 in directions2.md): the recording itself
// goes to the model, not the words the browser made of it.
//
// It exists because of Chris's point, which the text check can't get past:
// the browser's speech recognition writes down the word you *meant* —
// "mude" comes back as "müde" — so a wrong sound never reaches a check that
// only reads text. A model that listens can write down what was actually
// said, and that is what this asks it for first.
//
// What it promises is deliberately narrow, because that is what the tests
// behind it showed the small model can do (directions2.md, Answers 27–29):
// vowels and consonants that came out as a different sound. Not stress, not
// intonation — it didn't hear those — and not every mistake: it can miss
// some. What it reports, it reports reliably: no false alarms in forty
// judgments of correct speech.
//
// Lives here, apart from the action, for the reason given at the top of
// lib/shadowing-generation.ts: a "use server" module may only export async
// functions, and the page, the action and the tests all read these.

export interface SoundIssue {
    // The word as written in the sentence.
    word: string;
    // The sound that should have been there, and the one that was said.
    expected: string;
    said: string;
    // A line of advice for the learner: how to make the right sound. The
    // words check has always given each difference a line like this; a
    // wrong sound without one was a correction with no feedback
    // (Question 37).
    note: string;
}

export interface SoundsCheck {
    // The sentence written the way it sounded. Not shown (Question 36): it
    // comes back corrected too often to stand as "what you said". Still
    // asked for, and first, because writing down what it heard before
    // judging is the order the instructions were tested in.
    heard: string;
    issues: SoundIssue[];
}

// What happens to an attempt once the check listens too: the line beside
// Record, in place of SHADOWING_CHECK_CAVEAT. That one stays the true line
// where there is no sounds half — a guest, or a browser that can't record
// — and stays what the words check's prompt is told, since that half still
// only reads text.
//
// Said before you record rather than at the moment it happens, because
// nothing is pressed at that moment: the check starts by itself when you
// stop (Question 35). "This app doesn't keep it" and no more, since what
// Google does with what it is sent is Google's to say, not this page's.
export const SHADOWING_SOUNDS_PAGE_NOTE =
    "When you stop, your attempt is checked: the words against the sentence, and how they sounded, by sending the recording to Google. This app doesn't keep it.";

// Keep the "e.g. ü" and "e.g. u" below: they look like format examples, but
// they are what points the model at the umlauts. Without them it found the ü
// and ö in none of 5 test runs, with them in 5 and 3 (Answer 42).
export const soundsSchema = z.object({
    heard: z
        .string()
        .describe(
            "The sentence as you heard it, spelled the way it actually sounded — a wrongly said word spelled as it was said.",
        ),
    issues: z.array(
        z.object({
            word: z.string().describe("The word, as it is written in the sentence"),
            expected: z.string().describe("The sound that should have been there, e.g. ü"),
            said: z.string().describe("The sound that was said instead, e.g. u"),
            note: z
                .string()
                .describe("One short sentence in English for the learner: how to make the right sound"),
        }),
    ),
});

// The instructions Answer 28's tests ran with, worded for any language
// rather than German alone, plus the "write it down the way it sounded"
// line from Answer 29's round. Tuning them on the test recordings — and
// measuring this wording first — is the next iteration's job.
export function soundsPrompt(sentence: string, language?: string): string {
    const languageName = language?.trim();
    const learner = languageName ? `A learner of ${languageName}` : "A language learner";
    const standard = languageName ? `in standard ${languageName}` : "in the standard pronunciation of the sentence's language";

    return `${learner} recorded themselves saying the sentence below. Listen carefully and check only the sounds: whether each vowel and consonant came out as it should ${standard}.

First write down what you heard, the way it sounded: if a word was said wrongly, spell it the way it was said, not the way it should be written. Do not correct it to the intended sentence.

Do not comment on word stress, intonation, rhythm, speed or accent in general. Report a sound only when it clearly came out as a different sound — a different vowel or consonant — not when it was merely a little unusual. For each one, give the word, the sound that should have been there, the sound that was said instead, and one short sentence in English telling the learner how to make the right sound.

If every sound was right, return an empty list of issues. Do not invent problems to have something to report.

The sentence they were saying:
"${sentence}"`;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/^\/|\/$/g, "");

// What the model returns, made safe to show. It drops the items the tests
// showed it sometimes produces that say nothing — "should be ts, said ts" —
// along with empty and repeated ones, so the page never lists a "mistake"
// whose expected and said sounds are the same.
export function cleanSoundsCheck(raw: SoundsCheck): SoundsCheck {
    const seen = new Set<string>();
    const issues = raw.issues
        .map((issue) => ({
            word: issue.word.trim(),
            expected: issue.expected.trim(),
            said: issue.said.trim(),
            note: (issue.note ?? "").trim(),
        }))
        .filter((issue) => {
            if (!issue.word || !issue.expected || !issue.said) return false;
            if (normalize(issue.expected) === normalize(issue.said)) return false;
            const key = `${normalize(issue.word)}|${normalize(issue.expected)}|${normalize(issue.said)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    return { heard: raw.heard.trim(), issues };
}

// One thing to fix, in the one list the page shows (Question 37): a word
// that came back different (the words check), a word whose sound was wrong
// (the sounds check), or both at once.
export interface Finding {
    // The word or phrase as written in the sentence.
    word: string;
    // What the browser heard instead — empty when the word was left out.
    // Only on findings from the words check.
    heard?: string;
    // The sound that should have been there and the one that was said. Only
    // on findings from the sounds check.
    sound?: { expected: string; said: string };
    // Each half's line of feedback, words first.
    notes: string[];
}

const wordsOf = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter(Boolean);

// Both checks' findings as one list, in the order the words come in the
// sentence. They were two lists, and the first only ever held the words
// the browser had heard differently — which, since it corrects a wrong
// sound to the word you meant, left most wrong sounds without feedback
// above the line, and listed the ones it did catch twice. A word both
// checks found is one finding with both lines of feedback.
export function combineFindings(
    sentence: string,
    differences: ShadowingDifference[],
    issues: SoundIssue[],
): Finding[] {
    const findings: Finding[] = differences.map((difference) => ({
        word: difference.expected,
        heard: difference.heard,
        notes: difference.note ? [difference.note] : [],
    }));
    for (const issue of issues) {
        const [word] = wordsOf(issue.word);
        const same = findings.find(
            (finding) => !finding.sound && word !== undefined && wordsOf(finding.word).includes(word),
        );
        const sound = { expected: issue.expected, said: issue.said };
        if (same) {
            same.sound = sound;
            if (issue.note) same.notes.push(issue.note);
        } else {
            findings.push({ word: issue.word, sound, notes: issue.note ? [issue.note] : [] });
        }
    }

    const lower = sentence.toLowerCase();
    const position = (finding: Finding) => {
        const at = lower.indexOf(finding.word.toLowerCase());
        return at === -1 ? lower.length : at;
    };
    return findings
        .map((finding, order) => ({ finding, order }))
        .sort((a, b) => position(a.finding) - position(b.finding) || a.order - b.order)
        .map(({ finding }) => finding);
}

// Whether the sounds check's write-up of a recording has the sentence's
// words, counting a word that differs only in its marks — "mude" for
// "müde" — as the same word (Question 46). That write-up spells a wrong
// sound the way it was said, so the difference is the sound, already in
// the list of wrong sounds, not a different word. Only for that write-up:
// the browser's own text keeps its marks, and is compared exactly.
export function sameWordsIgnoringMarks(sentence: string, writtenDown: string): boolean {
    const unmarked = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "");
    return isWordPerfect(unmarked(sentence), unmarked(writtenDown));
}

// The server's checks on what arrives, before anything is sent on: a WAV
// file of a sensible size, for a sentence that exists. A message for the
// person when something is wrong, null when it is fine.
export function soundsUploadProblem(input: {
    bytes: Uint8Array;
    sentence: string;
}): string | null {
    if (!input.sentence.trim()) return "There's no sentence to compare against.";
    if (input.sentence.length > SHADOWING_ATTEMPT_MAX_CHARACTERS) {
        return "That sentence is too long for a sounds check — one sentence at a time, please.";
    }
    if (input.bytes.length === 0) return "Nothing was recorded — try recording again.";
    if (input.bytes.length > SHADOWING_SOUNDS_MAX_BYTES) {
        return "That recording is too long for a sounds check — keep it to one sentence.";
    }
    if (!looksLikeWav(input.bytes)) return "That recording couldn't be read — try recording again.";
    return null;
}
