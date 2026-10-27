// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// The check itself is the AI's job; here it is stubbed with a fixed answer,
// so what's left is the real screen showing that answer.
vi.mock("@/app/actions/writing-check-actions", () => ({
  checkWriting: vi.fn(async () => ({
    ok: true,
    data: {
      corrections: [
        {
          original: "habe",
          corrected: "bin",
          explanation: "Gehen takes sein in the perfect tense.",
        },
      ],
      correctedText: "Ich bin gestern ins Kino gegangen.",
    },
  })),
}));
vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn() }));
vi.mock("@/app/generated/prisma", () => ({
  NotePage: { writing: "writing", speaking: "speaking" },
}));

// The browser's speech recognition, as a stand-in that "hears" whatever a
// test hands it.
let hear: (spoken: string) => void = () => {};
vi.mock("@/lib/use-speech-to-text", () => ({
  useSpeechToText: ({ onFinalResult }: { onFinalResult: (spoken: string) => void }) => {
    hear = onFinalResult;
    return {
      supported: true,
      listening: false,
      interimTranscript: "",
      error: null,
      notice: null,
      start: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

import CheckTool from "./check-tool";
import { checkWriting } from "@/app/actions/writing-check-actions";

const placeholder = "Write, paste or dictate your text here…";

beforeEach(() => {
  vi.mocked(checkWriting).mockClear();
});

// Show changes draws the corrected text with what changed marked in place.
// It must compare against the text that was checked, and switching it off
// must give back the plain corrected text you can copy.

async function checkSomething() {
  render(<CheckTool />);
  fireEvent.change(screen.getByPlaceholderText(placeholder), {
    target: { value: "Ich habe gestern ins Kino gegangen." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
  await screen.findByText("Fully corrected");
}

describe("Writing Check's Show changes switch", () => {
  it("starts off, showing the corrected text plainly", async () => {
    await checkSomething();
    expect(screen.getByLabelText("Show changes")).not.toBeChecked();
    expect(screen.getByText("Ich bin gestern ins Kino gegangen.")).toBeInTheDocument();
    expect(document.querySelector("del")).toBeNull();
  });

  it("marks the removed and the added word when switched on", async () => {
    await checkSomething();
    fireEvent.click(screen.getByLabelText("Show changes"));
    expect(screen.getByText("habe", { selector: "del" })).toBeInTheDocument();
    expect(screen.getByText("bin", { selector: "ins" })).toBeInTheDocument();
  });

  // Editing the box after checking must not change what the corrected
  // text is compared against.
  it("compares with the text as it was checked, not the box now", async () => {
    await checkSomething();
    fireEvent.change(screen.getByPlaceholderText(placeholder), {
      target: { value: "Something else entirely" },
    });
    fireEvent.click(screen.getByLabelText("Show changes"));
    expect(screen.getByText("habe", { selector: "del" })).toBeInTheDocument();
    expect(screen.queryByText(/Something/, { selector: "del" })).toBeNull();
  });

  it("goes back to the plain text when switched off", async () => {
    await checkSomething();
    fireEvent.click(screen.getByLabelText("Show changes"));
    fireEvent.click(screen.getByLabelText("Show changes"));
    expect(document.querySelector("del")).toBeNull();
    expect(screen.getByText("Ich bin gestern ins Kino gegangen.")).toBeInTheDocument();
  });
});

// Writing Check takes Speak Check's dictation (Answer 53): a language
// field that stays optional for checking, a Dictate button that needs it,
// and the line saying what dictation can't tell you.
describe("Dictation in Writing Check", () => {
  const dictate = () => screen.getByRole("button", { name: "Dictate" });
  const languageField = () => screen.getByLabelText(/^Language/);

  it("offers Dictate, greyed out until a language is picked", () => {
    render(<CheckTool />);
    expect(dictate()).toBeDisabled();
    fireEvent.change(languageField(), { target: { value: "German" } });
    expect(dictate()).toBeEnabled();
  });

  it("puts what was dictated into the box, where it can still be edited", () => {
    render(<CheckTool />);
    act(() => hear("Ich habe gestern"));
    act(() => hear("ins Kino gegangen."));
    const box = screen.getByPlaceholderText(placeholder);
    expect(box).toHaveValue("Ich habe gestern ins Kino gegangen.");
    fireEvent.change(box, { target: { value: "Ich bin gestern ins Kino gegangen." } });
    expect(box).toHaveValue("Ich bin gestern ins Kino gegangen.");
  });

  it("still checks without a language, leaving the check to work it out", async () => {
    await checkSomething();
    expect(checkWriting).toHaveBeenCalledWith("Ich habe gestern ins Kino gegangen.", "");
  });

  it("tells the check the language when one is picked", async () => {
    render(<CheckTool />);
    fireEvent.change(languageField(), { target: { value: "German" } });
    fireEvent.change(screen.getByPlaceholderText(placeholder), {
      target: { value: "Ich habe gestern ins Kino gegangen." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText("Fully corrected");
    expect(checkWriting).toHaveBeenCalledWith("Ich habe gestern ins Kino gegangen.", "German");
  });
});

// Dictation hands the check the browser's text, which spells the word you
// meant — so the page says it checks words, not sounds, and where sounds
// are checked instead (Answer 54).
describe("what the check says it can't do", () => {
  it("is said beside the dictation, pointing to Shadowing Practice", () => {
    render(<CheckTool />);
    expect(screen.getByText(/checks what you said, not how you pronounced it/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Shadowing Practice" });
    expect(link).toHaveAttribute("href", "/speaking/shadowing");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
