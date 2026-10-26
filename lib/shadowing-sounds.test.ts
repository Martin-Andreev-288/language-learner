import { describe, it, expect } from "vitest";
import {
    cleanSoundsCheck,
    combineFindings,
    sameWordsIgnoringMarks,
    soundsPrompt,
    soundsUploadProblem,
} from "./shadowing-sounds";
import { encodeWav } from "./wav";
import { SHADOWING_SOUNDS_MAX_BYTES } from "./limits";

// What reaches the screen after the model has answered, and what the server
// refuses before it asks. The first decides whether a learner is told about
// a "mistake" that isn't one; the second whether anything odd is sent on.

describe("cleanSoundsCheck", () => {
    it("keeps real mistakes as they are, trimmed", () => {
        const cleaned = cleanSoundsCheck({
            heard: " Ich habe heute keine Seit. ",
            issues: [{ word: " Zeit ", expected: "ts", said: "s ", note: " Start with a t. " }],
        });
        expect(cleaned).toEqual({
            heard: "Ich habe heute keine Seit.",
            issues: [{ word: "Zeit", expected: "ts", said: "s", note: "Start with a t." }],
        });
    });

    // The tests behind this feature saw the model return exactly this.
    it("drops an item whose expected and said sounds are the same", () => {
        const cleaned = cleanSoundsCheck({
            heard: "Er übersetzt den Text.",
            issues: [
                { word: "übersetzt", expected: "ts", said: "ts", note: "" },
                { word: "Abend", expected: "/t/", said: "T", note: "" },
            ],
        });
        expect(cleaned.issues).toEqual([]);
    });

    it("drops empty and repeated items", () => {
        const cleaned = cleanSoundsCheck({
            heard: "x",
            issues: [
                { word: "müde", expected: "ü", said: "u", note: "Round your lips." },
                { word: "Müde", expected: "Ü", said: "U", note: "Round them more." },
                { word: "", expected: "ö", said: "o", note: "" },
                { word: "möchte", expected: "ö", said: "", note: "" },
            ],
        });
        expect(cleaned.issues).toEqual([
            { word: "müde", expected: "ü", said: "u", note: "Round your lips." },
        ]);
    });
});

describe("soundsPrompt", () => {
    it("asks for the sentence written the way it sounded, not corrected", () => {
        const prompt = soundsPrompt("Ich bin müde.", "German");
        expect(prompt).toContain('"Ich bin müde."');
        expect(prompt).toContain("A learner of German");
        expect(prompt).toMatch(/spell it the way it was said/);
        expect(prompt).toMatch(/Do not correct it to the intended sentence/);
    });

    // Stress and intonation are left out on purpose: the small model didn't
    // hear them in the tests, and a check that guesses at them would report
    // problems it can't actually perceive.
    it("asks for a line of feedback with each wrong sound", () => {
        expect(soundsPrompt("Ich bin müde.", "German")).toMatch(/one short sentence in English telling the learner how to make the right sound/);
    });

    it("keeps to sounds, and says not to invent problems", () => {
        const prompt = soundsPrompt("Ich bin müde.", "German");
        expect(prompt).toMatch(/Do not comment on word stress, intonation/);
        expect(prompt).toMatch(/Do not invent problems/);
    });

    it("still reads sensibly when no language was chosen", () => {
        const prompt = soundsPrompt("Hola.", "");
        expect(prompt).toContain("A language learner");
        expect(prompt).not.toContain("learner of ");
    });
});

// The page's one list of things to fix. The case behind it (Question 37):
// the browser heard "müde" — it corrects a wrong ü — but "mochte", a real
// word, so the words check found only the second, and the sounds check both.
describe("combineFindings", () => {
    const sentence = "Ich bin müde und möchte schlafen.";
    const mochte = { expected: "möchte", heard: "mochte", note: "That means liked." };
    const u = { word: "müde", expected: "ü", said: "u", note: "Round your lips." };
    const o = { word: "möchte", expected: "ö", said: "o", note: "Round them for ö." };

    it("lists a word both checks found once, with both lines of feedback", () => {
        expect(combineFindings(sentence, [mochte], [u, o])).toEqual([
            { word: "müde", sound: { expected: "ü", said: "u" }, notes: ["Round your lips."] },
            {
                word: "möchte",
                heard: "mochte",
                sound: { expected: "ö", said: "o" },
                notes: ["That means liked.", "Round them for ö."],
            },
        ]);
    });

    it("keeps the sentence's order, whichever check found what", () => {
        const schon = { expected: "schlafen", heard: "schon", note: "A different word." };
        const words = combineFindings(sentence, [schon, mochte], [u]).map((finding) => finding.word);
        expect(words).toEqual(["müde", "möchte", "schlafen"]);
    });

    it("matches a wrong sound to a difference that is a phrase", () => {
        const phrase = { expected: "möchte schlafen", heard: "mochte schon", note: "Two words changed." };
        const findings = combineFindings(sentence, [phrase], [o]);
        expect(findings).toHaveLength(1);
        expect(findings[0].notes).toEqual(["Two words changed.", "Round them for ö."]);
    });

    it("is either list alone when the other half has nothing", () => {
        expect(combineFindings(sentence, [mochte], [])).toEqual([
            { word: "möchte", heard: "mochte", notes: ["That means liked."] },
        ]);
        expect(combineFindings(sentence, [], [])).toEqual([]);
    });
});

// Question 46: when the browser heard no words, the words are judged from
// the sounds check's write-up, which spells a wrong sound as it was said.
describe("sameWordsIgnoringMarks", () => {
    const sentence = "Ich bin müde und möchte schlafen.";

    it("counts a word that only lost its marks as the same word", () => {
        expect(sameWordsIgnoringMarks(sentence, "Ich bin mude und mochte schlafen.")).toBe(true);
    });

    it("still sees a different or missing word", () => {
        expect(sameWordsIgnoringMarks(sentence, "Ich bin müde und will schlafen.")).toBe(false);
        expect(sameWordsIgnoringMarks(sentence, "Ich bin müde.")).toBe(false);
    });
});

describe("soundsUploadProblem", () => {
    const wav = encodeWav(new Float32Array(16000), 16000);

    it("accepts a WAV recording of one sentence", () => {
        expect(soundsUploadProblem({ bytes: wav, sentence: "Ich bin müde." })).toBeNull();
    });

    it("refuses a missing sentence, an empty recording, or a non-WAV file", () => {
        expect(soundsUploadProblem({ bytes: wav, sentence: "  " })).toMatch(/no sentence/);
        expect(soundsUploadProblem({ bytes: new Uint8Array(), sentence: "x" })).toMatch(/Nothing was recorded/);
        expect(soundsUploadProblem({ bytes: new Uint8Array(100), sentence: "x" })).toMatch(/couldn't be read/);
    });

    it("refuses a recording past the length cap", () => {
        const tooBig = new Uint8Array(SHADOWING_SOUNDS_MAX_BYTES + 1);
        tooBig.set(wav.subarray(0, 44));
        expect(soundsUploadProblem({ bytes: tooBig, sentence: "x" })).toMatch(/too long/);
    });
});
