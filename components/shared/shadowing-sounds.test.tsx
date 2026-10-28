// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { SHADOWING_CHECK_CAVEAT } from "@/lib/shadowing-check";
import { SHADOWING_SOUNDS_PAGE_NOTE } from "@/lib/shadowing-sounds";

// Shadowing's check, on the real practice screen. Signed in, with a
// recording, it starts by itself when you stop and asks two things: how the
// sounds came out, and whether the words were understood. Without a
// recording it is the words alone, from the browser's text, as before. The
// microphone, the browser's speech recognition and the server are
// stand-ins: the recognition "hears" a sentence when the test says so, the
// recorder holds a sound, and the actions answer when the test says so.

vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn() }));
const checkShadowingAttempt = vi.fn();
const checkShadowingSounds = vi.fn();
vi.mock("@/app/actions/shadowing-actions", () => ({
  checkShadowingAttempt: (...args: unknown[]) => checkShadowingAttempt(...args),
  checkShadowingSounds: (form: FormData) => checkShadowingSounds(form),
  generateShadowingPassage: vi.fn(),
}));
vi.mock("@/app/generated/prisma", () => ({ NotePage: { speaking: "speaking" } }));

let hear: (spoken: string) => void = () => {};
const speech = { listening: false, interimTranscript: "" };
vi.mock("@/lib/use-speech-to-text", () => ({
  useSpeechToText: ({ onFinalResult }: { onFinalResult: (spoken: string) => void }) => {
    hear = onFinalResult;
    return {
      supported: true,
      listening: speech.listening,
      interimTranscript: speech.interimTranscript,
      error: null,
      notice: null,
      start: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

const recorder = {
  supported: true,
  recording: false,
  preparing: false,
  sound: null as { wav: Uint8Array; seconds: number; peak: number } | null,
  tooLong: false,
  start: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
};
vi.mock("@/lib/use-sound-recorder", () => ({ useSoundRecorder: () => recorder }));

vi.mock("@/app/actions/word-lookup-actions", () => ({
  translateWordInContext: vi.fn(),
  lookupWord: vi.fn(),
}));
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({
  addVocabularyEntries: vi.fn(),
}));
import ShadowingTool from "./shadowing-tool";

const sentence = "Ich bin müde und möchte schlafen.";
// The way the tests behind this feature heard it said.
const saidWrongly = "Ich bin mude und mochte schlafen.";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

beforeEach(() => {
  window.sessionStorage.clear();
  checkShadowingAttempt.mockReset();
  checkShadowingSounds.mockReset();
  recorder.start.mockClear();
  speech.listening = false;
  speech.interimTranscript = "";
  recorder.recording = false;
  recorder.preparing = false;
  recorder.sound = null;
  recorder.tooLong = false;
});

function practise({ signedIn = true } = {}) {
  const view = render(<ShadowingTool isAuthenticated={signedIn} />);
  fireEvent.change(screen.getByPlaceholderText(/^e\.g\. German/), {
    target: { value: "German" },
  });
  fireEvent.change(screen.getByPlaceholderText(/^Paste the passage/), {
    target: { value: sentence },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start practicing" }));
  return view;
}

// As on the page: press Record, and only then is there a recording and do
// the browser's words arrive. The sound a test sets up beforehand is held
// back until Record is pressed — before that, a real page has none.
function practiseAndSay(spoken: string, options?: { signedIn?: boolean }) {
  const recording = recorder.sound;
  recorder.sound = null;
  const view = practise(options);
  fireEvent.click(screen.getByRole("button", { name: "Record your attempt" }));
  recorder.sound = recording;
  act(() => hear(spoken));
  return view;
}

// The same, when the browser hears no words at all.
function practiseAndRecordSilently() {
  const recording = recorder.sound;
  recorder.sound = null;
  const view = practise();
  fireEvent.click(screen.getByRole("button", { name: "Record your attempt" }));
  recorder.sound = recording;
  view.rerender(<ShadowingTool isAuthenticated />);
  return view;
}

const checkButton = () => screen.queryByRole("button", { name: /^Check/ });
const browserBox = () => screen.queryByLabelText("What the browser heard");
const resultBox = (text: string) => screen.getByText(text).closest(".rounded-lg");

describe("Shadowing's check, with a recording", () => {
  // The browser's words as you speak are its corrected guess, so they
  // aren't shown: only that it is listening.
  it("shows that it is listening, not what it hears", () => {
    speech.listening = true;
    speech.interimTranscript = "Ich bin müde und mochte";
    practise();
    expect(screen.getByText("Listening…")).toBeInTheDocument();
    expect(screen.queryByText(/mochte/)).toBeNull();
  });

  it("starts by itself and gives one result, words and sounds", async () => {
    recorder.sound = { wav: new Uint8Array([82, 73, 70, 70]), seconds: 3, peak: 0.5 };
    checkShadowingSounds.mockResolvedValue({
      ok: true,
      data: {
        heard: saidWrongly,
        issues: [
          { word: "müde", expected: "ü", said: "u" },
          { word: "möchte", expected: "ö", said: "o" },
        ],
      },
    });
    // The browser corrected "mude" to "müde", so the words match exactly:
    // the case where only the sound can show the mistake.
    practiseAndSay(sentence);
    expect(screen.getByText(SHADOWING_SOUNDS_PAGE_NOTE)).toBeInTheDocument();

    expect(await screen.findByText("All words understood")).toBeInTheDocument();
    // The sentence above has a "müde" of its own, a word you can tap (B3).
    const listed = screen.getAllByText("müde").find((element) => element.closest("li"));
    expect(listed?.closest("li")).toHaveTextContent("müde · should be ü, you said u");
    expect(screen.getByText(/not stress or\s+intonation/)).toBeInTheDocument();
    // Every word was there, but not every sound: not a green result.
    expect(resultBox("All words understood")).toHaveClass("border-amber-800");

    const form: FormData = checkShadowingSounds.mock.calls[0][0];
    expect(form.get("sentence")).toBe(sentence);
    expect(form.get("language")).toBe("German");
    expect((form.get("audio") as Blob).type).toBe("audio/wav");
    // A word-perfect attempt still costs no words request, and a recording
    // is checked once, however often the page draws.
    expect(checkShadowingAttempt).not.toHaveBeenCalled();
    expect(checkShadowingSounds).toHaveBeenCalledTimes(1);
    // Nothing to press, and no sentence on screen claiming to be what you
    // said: neither the browser's guess nor the model's write-up.
    expect(checkButton()).toBeNull();
    expect(browserBox()).toBeNull();
    expect(screen.queryByText("What was heard")).toBeNull();
    expect(screen.queryByText(saidWrongly)).toBeNull();
  });

  it("lists every wrong word once, each with its feedback", async () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    checkShadowingSounds.mockResolvedValue({
      ok: true,
      data: {
        heard: saidWrongly,
        issues: [
          { word: "müde", expected: "ü", said: "u", note: "Round your lips as for u, but say i." },
          { word: "möchte", expected: "ö", said: "o", note: "Round your lips as for o, but say e." },
        ],
      },
    });
    checkShadowingAttempt.mockResolvedValue({
      ok: true,
      data: {
        verdict: "close",
        summary: "You used the wrong vowel in möchte.",
        differences: [{ expected: "möchte", heard: "mochte", note: "That changes would like to liked." }],
      },
    });
    // What the browser makes of it: the ü corrected, the ö not, since
    // "mochte" is a word too.
    practiseAndSay("Ich bin müde und mochte schlafen.");

    expect(await screen.findByText("Nearly there")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("müde · should be ü, you said u");
    expect(items[0]).toHaveTextContent("Round your lips as for u, but say i.");
    expect(items[1]).toHaveTextContent("möchte · should be ö, you said o");
    expect(items[1]).toHaveTextContent("That changes would like to liked.");
    expect(items[1]).toHaveTextContent("Round your lips as for o, but say e.");
  });

  it("shows only that it is checking until the answer comes", async () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    const answer = deferred<unknown>();
    checkShadowingSounds.mockReturnValue(answer.promise);
    practiseAndSay("Ich bin müde und mochte schlafen.");

    expect(screen.getByText("Checking what you said…")).toBeInTheDocument();
    // The browser's guess is nowhere on screen to be taken for what you said.
    expect(screen.queryByText("Ich bin müde und mochte schlafen.")).toBeNull();
    expect(browserBox()).toBeNull();

    await act(async () => answer.resolve({ ok: true, data: { heard: saidWrongly, issues: [] } }));
    expect(screen.queryByText("Checking what you said…")).toBeNull();
    expect(screen.getByText("No clearly wrong sounds found.")).toBeInTheDocument();
  });

  it("waits while the recording is still being got ready", () => {
    recorder.preparing = true;
    practiseAndSay(sentence);
    expect(screen.getByText("Checking what you said…")).toBeInTheDocument();
    expect(browserBox()).toBeNull();
    expect(checkShadowingSounds).not.toHaveBeenCalled();
  });

  it("judges the browser's words once its last ones have arrived", async () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    const answer = deferred<unknown>();
    checkShadowingSounds.mockReturnValue(answer.promise);
    checkShadowingAttempt.mockResolvedValue({
      ok: true,
      data: {
        verdict: "close",
        summary: "One word changed.",
        differences: [{ expected: "möchte", heard: "will", note: "A different verb." }],
      },
    });
    practiseAndSay("Ich bin müde und will");
    // The rest of what the browser heard, arriving after you stopped.
    act(() => hear("schlafen."));
    await act(async () =>
      answer.resolve({ ok: true, data: { heard: "Ich bin müde und will schlafen.", issues: [] } }),
    );

    expect(await screen.findByText("Nearly there")).toBeInTheDocument();
    expect(checkShadowingAttempt).toHaveBeenCalledWith(
      sentence,
      "Ich bin müde und will schlafen.",
      "German",
    );
    // Both halves, in the one result.
    expect(resultBox("Nearly there")).toHaveTextContent("No clearly wrong sounds found.");
  });

  it("asks again only what failed", async () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    checkShadowingSounds
      .mockResolvedValueOnce({ ok: false, error: "Quota used up." })
      .mockResolvedValueOnce({ ok: true, data: { heard: saidWrongly, issues: [] } });
    checkShadowingAttempt.mockResolvedValue({
      ok: true,
      data: { verdict: "close", summary: "One word changed.", differences: [] },
    });
    practiseAndSay("Ich bin müde und will schlafen.");

    expect(await screen.findByText("Quota used up.")).toBeInTheDocument();
    expect(screen.getByText("Nearly there")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("No clearly wrong sounds found.")).toBeInTheDocument();
    expect(screen.queryByText("Quota used up.")).toBeNull();
    expect(checkShadowingSounds).toHaveBeenCalledTimes(2);
    expect(checkShadowingAttempt).toHaveBeenCalledTimes(1);
  });

  it("isn't green while the sounds are unknown", async () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    checkShadowingSounds.mockResolvedValue({ ok: false, error: "Quota used up." });
    practiseAndSay(sentence);
    expect(await screen.findByText("Quota used up.")).toBeInTheDocument();
    expect(resultBox("All words understood")).not.toHaveClass("border-emerald-800");
  });

  // Question 38: what you saw after "Record again" has to be that attempt's
  // result alone, never the last one's feedback beside the new verdict.
  it("shows nothing of the last attempt once you record again", async () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    checkShadowingSounds
      .mockResolvedValueOnce({
        ok: true,
        data: { heard: saidWrongly, issues: [{ word: "müde", expected: "ü", said: "u", note: "Round your lips." }] },
      })
      .mockResolvedValueOnce({ ok: true, data: { heard: sentence, issues: [] } });
    practiseAndSay(sentence);
    expect(await screen.findByText("Round your lips.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Record again" }));
    expect(screen.queryByText("Round your lips.")).toBeNull();
    expect(screen.queryByText("All words understood")).toBeNull();

    recorder.sound = { wav: new Uint8Array([2]), seconds: 3, peak: 0.5 };
    act(() => hear(sentence));
    expect(await screen.findByText("No clearly wrong sounds found.")).toBeInTheDocument();
    expect(screen.queryByText("Round your lips.")).toBeNull();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(checkShadowingSounds).toHaveBeenCalledTimes(2);
  });

  it("drops a check that answers after a new attempt began", async () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    const answer = deferred<unknown>();
    checkShadowingSounds.mockReturnValue(answer.promise);
    practiseAndSay(sentence);
    fireEvent.click(screen.getByRole("button", { name: "Record again" }));

    await act(async () => answer.resolve({ ok: true, data: { heard: saidWrongly, issues: [] } }));
    expect(screen.queryByText("No clearly wrong sounds found.")).toBeNull();
  });
});

// Stop means "check this"; Cancel and Esc mean "not this one" (Question 38).
describe("Cancelling an attempt", () => {
  for (const [how, cancel] of [
    ["Cancel", () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }))],
    ["Esc", () => fireEvent.keyDown(window, { key: "Escape" })],
  ] as const) {
    it(`throws it away unchecked, with ${how}`, async () => {
      speech.listening = true;
      checkShadowingSounds.mockResolvedValue({ ok: true, data: { heard: sentence, issues: [] } });
      const { rerender } = practise();
      cancel();

      // The recording ends, and the browser's last words arrive late. The
      // recorder keeps nothing of a recording thrown away (its own tests
      // show that), so there is no sound — only the late words.
      speech.listening = false;
      recorder.sound = null;
      act(() => hear(sentence));
      rerender(<ShadowingTool isAuthenticated />);

      expect(screen.queryByText("Checking what you said…")).toBeNull();
      expect(browserBox()).toBeNull();
      expect(checkShadowingSounds).not.toHaveBeenCalled();

      // And the next attempt is checked as usual.
      fireEvent.click(screen.getByRole("button", { name: "Record your attempt" }));
      recorder.sound = { wav: new Uint8Array([2]), seconds: 3, peak: 0.5 };
      act(() => hear(sentence));
      expect(await screen.findByText("No clearly wrong sounds found.")).toBeInTheDocument();
      expect(checkShadowingSounds).toHaveBeenCalledTimes(1);
    });
  }

  it("is offered only while recording", () => {
    practise();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});

// Question 46: on Android the browser's speech recognition and the recorder
// can't share the microphone. The recorder gets it, so there is a recording
// and no words — and the check, which used to wait for words, never ran.
describe("A recording the browser heard no words in", () => {
  it("is checked all the same, judging the words the recording was written down as", async () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    checkShadowingSounds.mockResolvedValue({
      ok: true,
      data: { heard: saidWrongly, issues: [{ word: "müde", expected: "ü", said: "u", note: "Round your lips." }] },
    });
    practiseAndRecordSilently();

    // "mude" for "müde" is the wrong sound, listed below — not a different
    // word — so the words are all there, and no words request is made.
    expect(await screen.findByText("All words understood")).toBeInTheDocument();
    expect(checkShadowingAttempt).not.toHaveBeenCalled();
    expect(screen.getByText("Round your lips.")).toBeInTheDocument();
    expect(resultBox("All words understood")).toHaveClass("border-amber-800");
    expect(screen.getByRole("button", { name: "Record again" })).toBeInTheDocument();
  });

  it("asks the words check when the write-up has a different word", async () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    checkShadowingSounds.mockResolvedValue({
      ok: true,
      data: { heard: "Ich bin müde und will schlafen.", issues: [] },
    });
    checkShadowingAttempt.mockResolvedValue({
      ok: true,
      data: { verdict: "close", summary: "One word changed.", differences: [] },
    });
    practiseAndRecordSilently();

    expect(await screen.findByText("Nearly there")).toBeInTheDocument();
    expect(checkShadowingAttempt).toHaveBeenCalledWith(sentence, "Ich bin müde und will schlafen.", "German");
  });

  it("isn't sent when it is silent, and says nothing was heard", () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0 };
    practiseAndRecordSilently();
    expect(screen.getByText(/Nothing was heard in that recording/)).toBeInTheDocument();
    expect(screen.queryByText("Checking what you said…")).toBeNull();
    expect(checkShadowingSounds).not.toHaveBeenCalled();
  });

  it("leaves a silent recording out, and checks the browser's words alone", () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0 };
    practiseAndSay(sentence);
    expect(browserBox()).toHaveValue(sentence);
    expect(checkShadowingSounds).not.toHaveBeenCalled();
    expect(screen.queryByText(/Nothing was heard/)).toBeNull();
  });
});

describe("Shadowing's check, without a recording", () => {
  it("is the words alone, from the browser's box", async () => {
    practiseAndSay(sentence);
    expect(browserBox()).toHaveValue(sentence);
    fireEvent.click(checkButton()!);

    expect(await screen.findByText("All words understood")).toBeInTheDocument();
    expect(checkShadowingSounds).not.toHaveBeenCalled();
    expect(screen.queryByText("Sounds")).toBeNull();
    expect(resultBox("All words understood")).toHaveClass("border-emerald-800");
  });

  it("says why when the recording ran too long", async () => {
    recorder.tooLong = true;
    practiseAndSay(sentence);
    expect(screen.getByText(/ran past 12\s+seconds/)).toBeInTheDocument();
    fireEvent.click(checkButton()!);
    expect(await screen.findByText("All words understood")).toBeInTheDocument();
    expect(checkShadowingSounds).not.toHaveBeenCalled();
  });

  // A guest has no sounds check, so their sound isn't recorded at all: no
  // second microphone stream beside the speech recognition (Answer 44).
  it("records the sound only for someone signed in", () => {
    speech.listening = true;
    practise({ signedIn: false });
    expect(recorder.start).not.toHaveBeenCalled();
    cleanup();
    practise({ signedIn: true });
    expect(recorder.start).toHaveBeenCalled();
  });

  it("keeps the old line, and sends nothing, for a guest", () => {
    recorder.sound = { wav: new Uint8Array([1]), seconds: 3, peak: 0.5 };
    practiseAndSay(sentence, { signedIn: false });
    expect(screen.getByText(SHADOWING_CHECK_CAVEAT)).toBeInTheDocument();
    expect(browserBox()).toHaveValue(sentence);
    expect(checkButton()).toBeNull();
    expect(checkShadowingSounds).not.toHaveBeenCalled();
  });
});
