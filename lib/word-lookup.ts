import { WORD_LOOKUP_MAX_CONTEXT_LENGTH } from "./limits";
import type { TextToken } from "./clickable-words";

// The pieces of the shared word-lookup window (components/shared/word-
// lookup-window.tsx) that aren't the screen: what is sent as context, the
// order translations come back in, and what the model is asked. Apart from
// the action for the reason given at the top of lib/shadowing-generation.ts:
// a "use server" module may only export async functions, and tests read
// these.

export interface WordTranslation {
    language: string;
    text: string;
}

// Sentence ends, in the scripts this app's languages are written in. A line
// break ends one too: a passage pasted as a list has no full stops.
const SENTENCE_END = /[.!?…。！？\n]/;

// The sentence a word sits in, sent along so the word is read in the sense
// it has there. A passage can run to 8,000 characters and the lookup
// accepts 500, so the whole passage was never the right thing to send; the
// sentence is, and a sentence longer than that is cut down to the part
// around the word.
export function sentenceAroundToken(
    tokens: TextToken[],
    index: number,
    maxLength = WORD_LOOKUP_MAX_CONTEXT_LENGTH,
): string {
    const text = tokens.map((token) => token.text).join("");
    const start = tokens.slice(0, index).reduce((sum, token) => sum + token.text.length, 0);
    const end = start + (tokens[index]?.text.length ?? 0);

    let from = start;
    while (from > 0 && !SENTENCE_END.test(text[from - 1])) from--;
    let to = end;
    while (to < text.length && !SENTENCE_END.test(text[to])) to++;
    if (to < text.length && text[to] !== "\n") to++; // keep the full stop

    let sentence = text.slice(from, to);
    if (sentence.trim().length > maxLength) {
        // Centred on the word, then cut back to whole words at both ends.
        const half = Math.floor((maxLength - (end - start)) / 2);
        const windowFrom = Math.max(from, start - half);
        const windowTo = Math.min(to, end + half);
        sentence = text.slice(windowFrom, windowTo);
        if (windowFrom > from) sentence = sentence.replace(/^\S*\s/, "");
        if (windowTo < to) sentence = sentence.replace(/\s\S*$/, "");
    }
    return sentence.trim();
}

// The languages asked for, as the request should see them: trimmed, none
// empty, none twice (compared without case — "german" and "German" are one
// language and one slot).
export function uniqueLanguages(languages: string[]): string[] {
    const seen = new Set<string>();
    return languages
        .map((language) => language.trim())
        .filter((language) => {
            if (!language) return false;
            const key = language.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

// What came back, in the order the languages were asked for and under the
// spelling the app asked with, not whatever casing the model chose. The
// same rule Inline Translate's batch translation follows, for the same
// reason: these names become the language of a vocabulary row when the
// word is saved. A language that came back empty is left out.
export function inAskedOrder(
    languages: string[],
    returned: WordTranslation[],
): WordTranslation[] {
    const byLanguage = new Map(
        returned.map((item) => [item.language.trim().toLowerCase(), item.text]),
    );
    return languages.flatMap((language) => {
        const text = byLanguage.get(language.toLowerCase());
        return typeof text === "string" && text.trim() ? [{ language, text: text.trim() }] : [];
    });
}

// The instructions for translating one word as it is used in its sentence,
// into each language asked for — and for naming the sentence's language,
// which the window needs for its pronounce and save buttons on a page that
// doesn't know it (a Flashcards card has no language of its own).
export function wordTranslationPrompt(word: string, context: string, languages: string[]): string {
    const list = languages.join(", ");
    return `A language learner looked up the word "${word}" while reading this phrase:
"""
${context}
"""

Translate "${word}" as it is used in that phrase — the sense that fits here, not just the most common one — into each of these languages: ${list}. If the word is part of a fixed expression there, translate the word as it works inside that expression.

Return:
- translations: one entry per language, "language" copied back exactly as written above, and "text" holding just the translation of "${word}" itself, with no labels or commentary. Do not skip a language, and do not add one that was not asked for.
- languageCode: the BCP-47 language tag for the language the phrase itself is written in, e.g. "de-DE".`;
}
