// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn() }));
vi.mock("@/app/generated/prisma", () => ({
  NotePage: { listening: "listening" },
}));

import ParallelListenTool from "./parallel-listen-tool";

// Clicking a sentence in the preview must start the reading there. The
// browser's voices are replaced by a stand-in that records what would have
// been said and lets a test finish an utterance the way the browser would.
// jsdom doesn't scroll, so scrollIntoView is replaced by a record of which
// element the page would have centered.

type FakeUtterance = {
  text: string;
  rate: number;
  onboundary: ((event: { name: string; charIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
let spoken: FakeUtterance[] = [];
let pause = vi.fn();
let speaking: FakeUtterance | null = null;
// Some browsers may report the end of the sentence being cut off from
// inside cancel() itself, before cancel() returns.
let cancelEndsAtOnce = false;
let centered: Element[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  spoken = [];
  speaking = null;
  cancelEndsAtOnce = false;
  centered = [];
  pause = vi.fn();
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      lang = "";
      rate = 1;
      onboundary: FakeUtterance["onboundary"] = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak: (utterance: FakeUtterance) => {
        spoken.push(utterance);
        speaking = utterance;
      },
      cancel: () => {
        const cutOff = speaking;
        speaking = null;
        if (cancelEndsAtOnce) cutOff?.onend?.();
      },
      pause,
      resume: vi.fn(),
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: function (this: HTMLElement) {
      centered.push(this);
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as { speechSynthesis?: unknown }).speechSynthesis;
  delete (HTMLElement.prototype as { scrollIntoView?: unknown })
    .scrollIntoView;
});

// Two languages, three sentences each, shown one sentence per line: the
// Vertical view, where the problem was seen.
function pasteTwoLanguagesInVerticalView() {
  render(<ParallelListenTool />);
  const [first, second] = screen.getAllByPlaceholderText(
    "Paste your text here...",
  );
  fireEvent.change(first, { target: { value: "One. Two. Three." } });
  fireEvent.change(second, { target: { value: "Eins. Zwei. Drei." } });
  fireEvent.click(screen.getByRole("button", { name: "Vertical" }));
}

function finishCurrentSentence() {
  act(() => speaking?.onend?.());
}

describe("Parallel Listen, following the reading", () => {
  it("centers the sentence being read while the pointer is still", () => {
    pasteTwoLanguagesInVerticalView();
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
    expect(centered.at(-1)?.textContent).toContain("One.");

    finishCurrentSentence();
    expect(centered.at(-1)?.textContent).toContain("Eins.");
  });

  it("holds the page still while the pointer moves over the preview", () => {
    pasteTwoLanguagesInVerticalView();
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
    const before = centered.length;

    // On its way to a sentence, while the reading moves on twice.
    fireEvent.pointerMove(screen.getByText("Three."));
    finishCurrentSentence();
    finishCurrentSentence();
    act(() => vi.advanceTimersByTime(1999));
    expect(centered).toHaveLength(before);

    // Still for long enough: the page catches up, once, to what is being
    // read now, not to each sentence it missed.
    act(() => vi.advanceTimersByTime(1));
    expect(centered).toHaveLength(before + 1);
    expect(centered.at(-1)?.textContent).toContain("Two.");
  });

  it("starts the clicked sentence even if cancel() ends the cut-off one at once", () => {
    cancelEndsAtOnce = true;
    pasteTwoLanguagesInVerticalView();
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
    expect(spoken.map((utterance) => utterance.text)).toEqual(["One."]);

    fireEvent.click(screen.getByText("Three."));

    // Only the clicked sentence, not "Eins." first.
    expect(spoken.slice(1).map((utterance) => utterance.text)).toEqual([
      "Three.",
    ]);
    expect(screen.getByText(/Reading sentence 3/)).toBeTruthy();
  });
});

describe("Parallel Listen, Pause and Resume", () => {
  it("Pause stops the sentence, and Resume reads it again from its start", () => {
    pasteTwoLanguagesInVerticalView();
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
    const cutOff = speaking;

    fireEvent.click(screen.getByRole("button", { name: "⏸ Pause" }));
    // Some voices end the sentence when it is stopped, instead of holding
    // it. That must not move the reading on to the next sentence.
    act(() => cutOff?.onend?.());
    expect(spoken.map((utterance) => utterance.text)).toEqual(["One."]);
    expect(screen.getByText(/Paused at sentence 1/)).toBeTruthy();
    expect(pause).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "▶ Resume" }));
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "One.",
      "One.",
    ]);
    expect(screen.getByText(/Reading sentence 1/)).toBeTruthy();
  });

  it("while paused, Table, Speed and Order start nothing, and Resume uses the new speed", () => {
    pasteTwoLanguagesInVerticalView();
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
    fireEvent.click(screen.getByRole("button", { name: "⏸ Pause" }));

    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    fireEvent.change(screen.getByLabelText(/^Speed/), {
      target: { value: "0.75" },
    });
    fireEvent.change(screen.getByLabelText(/^Order/), {
      target: { value: "language" },
    });
    expect(spoken).toHaveLength(1);
    expect(screen.getByRole("button", { name: "▶ Resume" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "▶ Resume" }));
    expect(spoken.at(-1)?.text).toBe("One.");
    expect(spoken.at(-1)?.rate).toBe(0.75);
  });
});

// Some browsers stop the sentence being read when you click anywhere on the
// page, even on empty space, and the page used to move on to the next
// sentence (Questions 115 and 116).
describe("Parallel Listen, a click on empty space", () => {
  it("carries the sentence on from the word it had reached", () => {
    render(<ParallelListenTool />);
    const [first] = screen.getAllByPlaceholderText("Paste your text here...");
    fireEvent.change(first, { target: { value: "One two three four. Five six." } });
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
    act(() => vi.advanceTimersByTime(3000));

    // The browser reports the word it is saying: "three".
    act(() => speaking?.onboundary?.({ name: "word", charIndex: 8 }));
    fireEvent.pointerDown(document.body);
    finishCurrentSentence();
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "One two three four.",
      "three four.",
    ]);
    expect(screen.getByText(/Reading sentence 1/)).toBeTruthy();

    // The rest, when it really finishes, moves on as usual.
    act(() => vi.advanceTimersByTime(3000));
    finishCurrentSentence();
    expect(spoken.at(-1)?.text).toBe("Five six.");
  });

  it("reads the sentence from its start if the browser reports no words", () => {
    pasteTwoLanguagesInVerticalView();
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
    act(() => vi.advanceTimersByTime(3000));

    fireEvent.pointerDown(document.body);
    finishCurrentSentence();
    expect(spoken.map((utterance) => utterance.text)).toEqual(["One.", "One."]);
    expect(screen.getByText(/Reading sentence 1/)).toBeTruthy();

    // The repeat, when it really finishes, moves on as usual.
    act(() => vi.advanceTimersByTime(3000));
    finishCurrentSentence();
    expect(spoken.at(-1)?.text).toBe("Eins.");
  });

  it("moves on as usual when the sentence ends long after the click", () => {
    pasteTwoLanguagesInVerticalView();
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));

    fireEvent.pointerDown(document.body);
    act(() => vi.advanceTimersByTime(1001));
    finishCurrentSentence();
    expect(spoken.map((utterance) => utterance.text)).toEqual(["One.", "Eins."]);
  });

  it("doesn't repeat a short sentence that the click itself started", () => {
    pasteTwoLanguagesInVerticalView();
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));

    fireEvent.pointerDown(screen.getByText("Three."));
    fireEvent.click(screen.getByText("Three."));
    finishCurrentSentence();
    expect(spoken.slice(1).map((utterance) => utterance.text)).toEqual([
      "Three.",
      "Drei.",
    ]);
  });
});

// The word the voice is saying is marked, not only its sentence, when the
// voice reports its words (Question 118).
describe("Parallel Listen, the word being read", () => {
  function playText(value: string) {
    render(<ParallelListenTool />);
    const [first] = screen.getAllByPlaceholderText("Paste your text here...");
    fireEvent.change(first, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Vertical" }));
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
  }
  const markedWord = () =>
    document.querySelector("[data-reading-word]")?.textContent ?? null;

  it("marks the word the voice reports, and nothing before it does", () => {
    playText("One two three four. Five six.");
    expect(markedWord()).toBeNull();

    act(() => speaking?.onboundary?.({ name: "word", charIndex: 8 }));
    expect(markedWord()).toBe("three");

    // The next sentence starts unmarked until its first word is reported.
    finishCurrentSentence();
    expect(markedWord()).toBeNull();
    act(() => speaking?.onboundary?.({ name: "word", charIndex: 0 }));
    expect(markedWord()).toBe("Five");
  });

  // The voice is given the sentence without its stress marks, so its
  // positions count different characters from the screen's.
  it("finds the word on the screen across stress marks", () => {
    playText("Я иду\u0301 домо\u0301й.");
    expect(spoken[0].text).toBe("Я иду домой.");

    act(() => speaking?.onboundary?.({ name: "word", charIndex: 6 }));
    expect(markedWord()).toBe("домо\u0301й");
  });
});
