// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn() }));
vi.mock("@/app/generated/prisma", () => ({
  NotePage: { listening: "listening" },
}));

import InlineListenTool from "./inline-listen-tool";

// Pause stops the sentence and Resume reads it again from its start, the
// same as Parallel Listen. The browser's voices are replaced by a stand-in
// that records what would have been said and lets a test end an utterance
// the way the browser would.

type FakeUtterance = {
  text: string;
  lang: string;
  rate: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
let spoken: FakeUtterance[] = [];
let speaking: FakeUtterance | null = null;
let pause = vi.fn();

beforeEach(() => {
  window.sessionStorage.clear();
  spoken = [];
  speaking = null;
  pause = vi.fn();
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
        speaking = null;
      },
      pause,
      resume: vi.fn(),
    },
  });
  // jsdom doesn't scroll; the page centers the sentence being read.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  });
});

afterEach(() => {
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
