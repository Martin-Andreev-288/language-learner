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
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
let spoken: FakeUtterance[] = [];
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
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      lang = "";
      rate = 1;
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
      pause: vi.fn(),
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
