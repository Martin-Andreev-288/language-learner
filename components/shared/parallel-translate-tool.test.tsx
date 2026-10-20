// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The tool imports server actions, which pull in Prisma and auth. None of
// that is what's under test here, so each is replaced by a stub.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn() }));
vi.mock("@/app/actions/parallel-translate-actions", () => ({
  translateSentences: vi.fn(),
}));
vi.mock("@/app/generated/prisma", () => ({ NotePage: { reading: "reading" } }));

import ParallelTranslateTool from "./parallel-translate-tool";

// The aligned table is the result, so it comes first; the Markdown it is
// turned into folds away below it. These pin that order down, and that
// Copy and Save are still reachable without unfolding anything.

function alignTwoLanguages() {
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

function exportText() {
  return screen.queryByLabelText("The aligned sentences as text");
}

describe("Parallel Translate's result", () => {
  it("shows nothing before you align", () => {
    render(<ParallelTranslateTool defaultTranslateLanguage="English" />);
    expect(screen.queryByText("Aligned sentences")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Export as Markdown/ })).toBeNull();
  });

  it("shows the table first, with the Markdown folded away", () => {
    alignTwoLanguages();
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Ich gehe nach Hause.");
    expect(exportText()).toBeNull();
    expect(screen.getByRole("button", { name: /Export as Markdown/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("keeps Copy and Save in reach while the text is folded", () => {
    alignTwoLanguages();
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save to a new note" })).toBeEnabled();
  });

  it("unfolds to the Markdown table on request", () => {
    alignTwoLanguages();
    fireEvent.click(screen.getByRole("button", { name: /Export as Markdown/ }));
    expect(exportText()).toHaveValue(
      "| English | German |\n|---|---|\n| I am tired. | Ich bin müde. |\n| I go home. | Ich gehe nach Hause. |\n",
    );
  });

  // The switch changes the view and the exported text together, so what
  // you copy is always what you see.
  it("switches the view and the text to Vertical together", () => {
    alignTwoLanguages();
    fireEvent.click(screen.getByRole("button", { name: "Vertical" }));
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Export as Markdown/ }));
    expect(exportText()).toHaveValue(
      "- English: I am tired.\n- German: Ich bin müde.\n\n- English: I go home.\n- German: Ich gehe nach Hause.\n\n",
    );
  });

  it("folds the text again after Clear", () => {
    alignTwoLanguages();
    fireEvent.click(screen.getByRole("button", { name: /Export as Markdown/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("Aligned sentences")).not.toBeInTheDocument();
    expect(exportText()).toBeNull();
  });
});
