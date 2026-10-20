// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
vi.mock("@/lib/use-speech-to-text", () => ({
  useSpeechToText: () => ({
    supported: true,
    listening: false,
    interimTranscript: "",
    error: null,
    notice: null,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

import CheckTool from "./check-tool";

// Show changes draws the corrected text with what changed marked in place.
// It must compare against the text that was checked, and switching it off
// must give back the plain corrected text you can copy.

async function checkSomething() {
  render(<CheckTool mode="writing" />);
  fireEvent.change(screen.getByPlaceholderText("Write or paste your text here..."), {
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
    fireEvent.change(screen.getByPlaceholderText("Write or paste your text here..."), {
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
