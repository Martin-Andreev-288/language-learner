// Stress marks in Cyrillic learner texts (Questions 113 and 114).
//
// Learner texts mark the stressed vowel with an accent, "домо́й", "говори́шь".
// No single character exists for a stressed Cyrillic vowel, so the mark is
// stored as a separate combining character after it. It is not part of the
// word: a voice doesn't need it to stress the word, and speech recognition
// never writes it. Left in, it made voices spell out the end of a word
// (lib/speech-text.ts), and it made "говори́шь" in the sentence and the
// "говоришь" the recogniser heard count as two different words
// (lib/shadowing-check.ts).
//
// Only after a vowel, because that is the only place a stress mark goes,
// counting the Bulgarian "ъ", which is a vowel there and can carry one.
// The same accent after a consonant is part of a letter, the Macedonian
// "ѓ" and "ќ" when stored in two parts, and stays. Nothing is normalised
// to find these: composing the whole text (NFC) also swaps some
// punctuation for look-alikes, the Greek ano teleia among them.
const CYRILLIC_STRESS_MARK = /([аеёиоуыэюяіїєъАЕЁИОУЫЭЮЯІЇЄЪ])[\u0300\u0301]+/g;

export function withoutStressMarks(text: string): string {
    return text.replace(CYRILLIC_STRESS_MARK, "$1");
}
