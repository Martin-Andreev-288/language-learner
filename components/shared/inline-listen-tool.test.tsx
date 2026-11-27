// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn() }));
vi.mock("@/app/generated/prisma", () => ({
  NotePage: { listening: "listening" },
}));

import InlineListenTool from "./inline-listen-tool";

// Pause stops the sentence and Resume reads it again from its start, and a
// click starts the sentence clicked, the same as Parallel Listen. The
// browser's voices are replaced by a stand-in that records what would have
// been said and lets a test end an utterance the way the browser would.
// jsdom doesn't scroll, so scrollIntoView is replaced by a record of which
// element the page would have centered.

type FakeUtterance = {
  text: string;
  lang: string;
  rate: number;
  onboundary: ((event: { name: string; charIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
let spoken: FakeUtterance[] = [];
let speaking: FakeUtterance | null = null;
let pause = vi.fn();
// Some browsers may report the end of the sentence being cut off from
// inside cancel() itself, before cancel() returns.
let cancelEndsAtOnce = false;
let centered: Element[] = [];

beforeEach(() => {
  window.sessionStorage.clear();
  spoken = [];
  speaking = null;
  pause = vi.fn();
  cancelEndsAtOnce = false;
  centered = [];
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

function pasteAndPlay() {
  render(<InlineListenTool />);
  fireEvent.change(
    screen.getByPlaceholderText("Paste the passage you want to listen to…"),
    { target: { value: "One. Two. Three." } },
  );
  fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
}

describe("Inline Listen, Pause and Resume", () => {
  it("Pause stops the sentence, and Resume reads it again from its start", () => {
    pasteAndPlay();
    const cutOff = speaking;

    fireEvent.click(screen.getByRole("button", { name: "⏸ Pause" }));
    // Some voices end the sentence when it is stopped, instead of holding
    // it. That must not move the reading on to the next sentence.
    act(() => cutOff?.onend?.());
    expect(spoken.map((utterance) => utterance.text)).toEqual(["One."]);
    expect(screen.getByText(/Paused at sentence 1 of 3/)).toBeTruthy();
    expect(pause).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "▶ Resume" }));
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "One.",
      "One.",
    ]);
    expect(screen.getByText(/Reading sentence 1 of 3/)).toBeTruthy();
  });

  it("while paused, Speed and Language start nothing, and Resume uses both", () => {
    pasteAndPlay();
    fireEvent.click(screen.getByRole("button", { name: "⏸ Pause" }));

    fireEvent.change(screen.getByLabelText(/^Speed/), {
      target: { value: "0.75" },
    });
    fireEvent.change(screen.getByLabelText(/^Language/), {
      target: { value: "German" },
    });
    expect(spoken).toHaveLength(1);
    expect(screen.getByRole("button", { name: "▶ Resume" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "▶ Resume" }));
    expect(spoken.at(-1)?.text).toBe("One.");
    expect(spoken.at(-1)?.rate).toBe(0.75);
    expect(spoken.at(-1)?.lang).toBe("de-DE");
  });
});

describe("Inline Listen, following the reading", () => {
  it("holds the page still while the pointer moves over the preview", () => {
    vi.useFakeTimers();
    pasteAndPlay();
    expect(centered.at(-1)?.textContent).toBe("One.");
    const before = centered.length;

    // On its way to a sentence, while the reading moves on twice.
    fireEvent.pointerMove(screen.getByText("Three."));
    act(() => speaking?.onend?.());
    act(() => speaking?.onend?.());
    act(() => vi.advanceTimersByTime(1999));
    expect(centered).toHaveLength(before);

    // Still for long enough: the page catches up, once, to what is being
    // read now, not to each sentence it missed.
    act(() => vi.advanceTimersByTime(1));
    expect(centered).toHaveLength(before + 1);
    expect(centered.at(-1)?.textContent).toBe("Three.");
  });

  it("starts the clicked sentence even if cancel() ends the cut-off one at once", () => {
    cancelEndsAtOnce = true;
    pasteAndPlay();
    expect(spoken.map((utterance) => utterance.text)).toEqual(["One."]);

    fireEvent.click(screen.getByText("Three."));

    // Only the clicked sentence, not "Two." first.
    expect(spoken.slice(1).map((utterance) => utterance.text)).toEqual([
      "Three.",
    ]);
    expect(screen.getByText(/Reading sentence 3 of 3/)).toBeTruthy();
  });
});

// Some browsers stop the sentence being read when you click anywhere on the
// page, even on empty space, and the page used to move on to the next
// sentence (Questions 115 and 116).
describe("Inline Listen, a click on empty space", () => {
  it("carries the sentence on from the word it had reached", () => {
    vi.useFakeTimers();
    render(<InlineListenTool />);
    fireEvent.change(
      screen.getByPlaceholderText("Paste the passage you want to listen to…"),
      { target: { value: "One two three four. Five six." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
    act(() => vi.advanceTimersByTime(3000));

    // The browser reports the word it is saying: "three".
    act(() => speaking?.onboundary?.({ name: "word", charIndex: 8 }));
    fireEvent.pointerDown(document.body);
    act(() => speaking?.onend?.());
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "One two three four.",
      "three four.",
    ]);
    expect(screen.getByText(/Reading sentence 1 of 2/)).toBeTruthy();

    // The rest, when it really finishes, moves on as usual.
    act(() => vi.advanceTimersByTime(3000));
    act(() => speaking?.onend?.());
    expect(spoken.at(-1)?.text).toBe("Five six.");
  });

  it("reads the sentence from its start if the browser reports no words", () => {
    vi.useFakeTimers();
    pasteAndPlay();
    act(() => vi.advanceTimersByTime(3000));

    fireEvent.pointerDown(document.body);
    act(() => speaking?.onend?.());
    expect(spoken.map((utterance) => utterance.text)).toEqual(["One.", "One."]);
    expect(screen.getByText(/Reading sentence 1 of 3/)).toBeTruthy();

    // The repeat, when it really finishes, moves on as usual.
    act(() => vi.advanceTimersByTime(3000));
    act(() => speaking?.onend?.());
    expect(spoken.at(-1)?.text).toBe("Two.");
  });

  it("moves on as usual when the sentence ends long after the click", () => {
    vi.useFakeTimers();
    pasteAndPlay();

    fireEvent.pointerDown(document.body);
    act(() => vi.advanceTimersByTime(1001));
    act(() => speaking?.onend?.());
    expect(spoken.map((utterance) => utterance.text)).toEqual(["One.", "Two."]);
  });

  it("doesn't repeat a short sentence that the click itself started", () => {
    vi.useFakeTimers();
    pasteAndPlay();

    fireEvent.pointerDown(screen.getByText("Three."));
    fireEvent.click(screen.getByText("Three."));
    act(() => speaking?.onend?.());
    expect(spoken.map((utterance) => utterance.text)).toEqual(["One.", "Three."]);
    expect(screen.queryByText(/Reading sentence/)).toBeNull();
  });
});
