// Cleaning text up before a voice reads it out (Question 386 item 6,
// rewritten in Question 411).
//
// The problem: a speech synthesiser has no natural reading for a symbol, so
// it announces one. Paste a passage carrying stray markdown or code and the
// voice says "hash", "asterisk", "at", "dollar", "caret" in the middle of
// your sentence.
//
// This started as a list of four symbols to remove and that was the wrong
// shape, which Question 411 found in about a minute by trying nine more
// that also spoke. A list of banned characters is a list you are always
// behind on: after @ $ % ^ & _ + = \ come ~ | { } [ ] © ° § € • → ½, and
// then whatever the next passage happens to contain.
//
// So the rule is inverted. Instead of naming what cannot be spoken, name
// what can — letters, numbers, and the punctuation a voice actually uses —
// and drop everything else. That covers characters neither of us has
// thought of, which is the only way this stops needing maintenance.

// Kept, because a voice uses these for *timing* rather than reading them
// aloud: the fall at a full stop, the lift at a question mark, the pause at
// a comma. Removing them would not delete a spoken word, it would flatten
// every sentence into one breathless line. This is the distinction
// Question 392 drew, now written as a list of what survives.
//
// Grouped by script rather than thrown into one run of characters, because
// this app offers 55 languages and a list this size is otherwise
// impossible to review. The first version of it covered Latin only, which
// silently stripped Chinese sentence punctuation — "你好，世界。" came back
// as "你好 世界", with the comma and full stop that carry its phrasing
// removed.
const KEPT_PUNCTUATION = [
    // Latin sentence punctuation and pauses.
    ".,;:!?",

    // Apostrophes: straight, curly, and the modifier-letter form. The ones
    // that would be missed most if this list were ever trimmed — without
    // them "don't" becomes "dont" and "l'eau" becomes "leau", which no
    // voice reads correctly in either language. Real text contains all
    // three, so all three stay.
    "'’ʼ",

    // Dashes and the ellipsis, all of which a voice reads as a pause.
    "-–—…",

    // Quotation marks, in the shapes these languages actually use — curly,
    // German low-9, French and Swiss guillemets.
    '"“”„«»‹›‘',

    // Spanish opens a question and an exclamation as well as closing it,
    // and the opening mark is the half that matters most to a synthesiser:
    // it is what tells the voice to raise the intonation from the first
    // word rather than discovering the question at the end.
    "¿¡",

    // Greek ano teleia, its semicolon — twice, because the mark has two
    // codepoints that look identical and both occur in real text: its own
    // (U+0387) and the plain middle dot (U+00B7) that Unicode normalises it
    // to. Listing only the first passed every Greek test I wrote by hand and
    // would have dropped the phrasing out of Greek pasted from anywhere that
    // normalises its text, which is most places. The Greek question mark
    // needs no entry: it is the same character Latin uses for a semicolon.
    "··",

    // Chinese, Japanese and Korean: the ideographic full stop and comma,
    // the fullwidth forms of the marks Latin shares, the halfwidth forms
    // that appear in text carrying halfwidth katakana, and the corner
    // brackets these languages quote with instead of quotation marks.
    "。、，！？：；．｡､「」『』",

    // Arabic, Persian and Urdu, which mirror the comma and semicolon and
    // have their own full stop.
    "،؛؟۔",

    // Hebrew: the maqaf, which is its hyphen, and the geresh and gershayim,
    // which mark an abbreviation or an acronym and so change how the word
    // they sit in is read rather than decorating it.
    "־׳״",

    // Devanagari and Bengali danda — the full stop of Hindi and Bengali.
    "।॥",

    // Armenian, which uses its own marks for all four.
    "։՜՝՞",
].join("");

// Escaped for use inside a character class, the same way
// lib/sentence-split.ts escapes its abbreviation list — so the punctuation
// above stays one readable string rather than being spelled twice, once for
// people and once for the regular expression.
const escapeForCharacterClass = (value: string) =>
    value.replace(/[\\\]^-]/g, "\\$&");

// Everything that is NOT a letter, a number, a combining mark, whitespace,
// or one of the above.
//
// \p{L} and \p{M} rather than A-Z: this app handles 55 languages, so the
// rule has to pass Cyrillic, Greek, Chinese and accented Latin untouched.
// \p{M} matters on its own — an accent stored as a separate combining
// character would otherwise be stripped off the letter it belongs to,
// quietly turning "é" into "e".
const NOT_SPEAKABLE = new RegExp(
    `[^\\p{L}\\p{N}\\p{M}\\s${escapeForCharacterClass(KEPT_PUNCTUATION)}]`,
    "gu",
);

// Runs of spaces and tabs, but never newlines — a line break is a pause
// worth keeping, and the tools that call this sometimes hand over more
// than one line.
const HORIZONTAL_WHITESPACE = /[^\S\n]+/g;

export function speakableText(text: string): string {
    const cleaned = text
        // A space rather than nothing, which matters for the ones that sit
        // between words: "and/or" deleted becomes "andor", a word no voice
        // can say, where "and or" is what a reader would have said anyway.
        .replace(NOT_SPEAKABLE, " ")
        .replace(HORIZONTAL_WHITESPACE, " ")
        .trim();

    // If a line was *only* symbols there is now nothing left to say, and an
    // empty utterance is worse than an ugly one: Shadowing chains its
    // repeats on the `onend` event, and an utterance with no words does not
    // reliably fire it in every browser — so the chain would simply stop.
    // Saying "asterisk asterisk" is a poor outcome; a Play button that
    // silently does nothing is a worse one.
    return cleaned || text.trim();
}
