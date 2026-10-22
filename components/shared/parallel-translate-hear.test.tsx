// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { guessLanguageCode } from "@/lib/language-codes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn() }));
vi.mock("@/app/actions/parallel-translate-actions", () => ({
  translateSentences: vi.fn(),
}));
vi.mock("@/app/generated/prisma", () => ({ NotePage: { reading: "reading" } }));

import ParallelTranslateTool from "./parallel-translate-tool";

// Clicking a sentence in the aligned table reads it aloud in its own
// column's language. The browser's voices are replaced by a stand-in that
// records what would have been said, and in which language, and lets the
// test finish an utterance the way the browser would.

type FakeUtterance = {
  text: string;
  lang: string;
  rate: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
let spoken: FakeUtterance[] = [];
const cancel = vi.fn();

beforeEach(() => {
  window.sessionStorage.clear();
  spoken = [];
  cancel.mockClear();
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
      speak: (utterance: FakeUtterance) => spoken.push(utterance),
      cancel,
      resume: vi.fn(),
    },
  });
});

afterEach(() => {
  // Undoes the fake text selection one test sets up, which would otherwise
  // make every later click look like the end of a selection.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as { speechSynthesis?: unknown }).speechSynthesis;
});

function alignEnglishAndGerman() {
  render(<ParallelTranslateTool defaultTranslateLanguage="English" />);
  fireEvent.change(screen.getByPlaceholderText("Paste your English here..."), {
    target: { value: "I am tired. I go home." },
  });
  fireEvent.change(screen.getByPlaceholderText(/^Language 2/), {
    target: { value: "German" },
  });
  fireEvent.change(screen.getByPlaceholderText("Paste your German here..."), {
    target: { value: "Ich bin müde. Ich gehe nach Hause." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Align sentences" }));
}

function sentence(text: string) {
  return screen.getByRole("button", { name: text });
}

describe("hearing a sentence in Parallel Translate", () => {
  it("says it is possible, under the heading", () => {
    alignEnglishAndGerman();
    expect(screen.getByText("Click a sentence to hear it.")).toBeInTheDocument();
  });

  it("reads a sentence in its own column's language", () => {
    alignEnglishAndGerman();
    fireEvent.click(sentence("Ich gehe nach Hause."));
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("Ich gehe nach Hause.");
    expect(spoken[0].lang).toBe(guessLanguageCode("German"));

    fireEvent.click(sentence("I am tired."));
    expect(spoken.at(-1)?.lang).toBe(guessLanguageCode("English"));
  });

  it("marks the sentence while it is read, and unmarks it at the end", () => {
    alignEnglishAndGerman();
    fireEvent.click(sentence("Ich bin müde."));
    expect(sentence("Ich bin müde.")).toHaveAttribute("aria-pressed", "true");

    act(() => spoken[0].onend?.());
    expect(sentence("Ich bin müde.")).toHaveAttribute("aria-pressed", "false");
  });

  it("stops when the same sentence is clicked again", () => {
    alignEnglishAndGerman();
    fireEvent.click(sentence("Ich bin müde."));
    cancel.mockClear();
    fireEvent.click(sentence("Ich bin müde."));
    expect(cancel).toHaveBeenCalled();
    expect(spoken).toHaveLength(1);
    expect(sentence("Ich bin müde.")).toHaveAttribute("aria-pressed", "false");
  });

  it("works from the keyboard, with Enter", () => {
    alignEnglishAndGerman();
    fireEvent.keyDown(sentence("I go home."), { key: "Enter" });
    expect(spoken.at(-1)?.text).toBe("I go home.");
  });

  // Selecting part of a sentence to copy it also ends in a click.
  it("doesn't speak when the click ends a text selection", () => {
    alignEnglishAndGerman();
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "müde",
    } as Selection);
    fireEvent.click(sentence("Ich bin müde."));
    expect(spoken).toHaveLength(0);
  });

  it("works in the Vertical view too", () => {
    alignEnglishAndGerman();
    fireEvent.click(screen.getByRole("button", { name: "Vertical" }));
    fireEvent.click(sentence("Ich bin müde."));
    expect(spoken.at(-1)?.lang).toBe(guessLanguageCode("German"));
  });
});
