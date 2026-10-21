// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

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

// The page keeps a draft of itself in this tab's sessionStorage, so each
// test starts from an empty one rather than from the last test's text.
beforeEach(() => {
  window.sessionStorage.clear();
});

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

// Leaving the page and coming back used to lose everything typed into it.
// Unmounting and rendering again is that round trip, minus the router.
describe("coming back to Parallel Translate in the same tab", () => {
  it("brings back the columns and the aligned table as they were left", () => {
    alignTwoLanguages();
    fireEvent.click(screen.getByRole("button", { name: "Vertical" }));
    cleanup();

    render(<ParallelTranslateTool defaultTranslateLanguage="English" />);
    expect(screen.getByPlaceholderText("Paste your German here...")).toHaveValue(
      "Ich bin müde. Ich gehe nach Hause.",
    );
    expect(screen.getByText("Aligned sentences")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vertical" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Back as it was, but folded, and without scrolling anywhere.
    expect(exportText()).toBeNull();
  });

  it("brings back text that was typed but never aligned", () => {
    render(<ParallelTranslateTool defaultTranslateLanguage="English" />);
    fireEvent.change(screen.getByPlaceholderText("Paste your English here..."), {
      target: { value: "Half-written" },
    });
    cleanup();

    render(<ParallelTranslateTool defaultTranslateLanguage="English" />);
    expect(screen.getByPlaceholderText("Paste your English here...")).toHaveValue(
      "Half-written",
    );
    expect(screen.queryByText("Aligned sentences")).not.toBeInTheDocument();
  });

  it("starts fresh after Clear, with the default language back", () => {
    alignTwoLanguages();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    cleanup();

    render(<ParallelTranslateTool defaultTranslateLanguage="English" />);
    expect(screen.getByPlaceholderText("Paste your English here...")).toHaveValue("");
    expect(screen.queryByText("Aligned sentences")).not.toBeInTheDocument();
  });
});

// A full page load is different from coming back by a click: the server
// draws the page first, without this tab's draft, and the browser takes
// that over. If the two disagree React reports a mismatch (error #418)
// and redraws everything. This is that sequence, without a browser.
describe("a full page load with a draft in the tab", () => {
  it("takes over the server's page without a mismatch, then restores", async () => {
    window.sessionStorage.setItem(
      "parallel-translate:draft",
      JSON.stringify({
        columns: [{ name: "English", text: "Kept across a reload.", collapsed: false }],
        outputFormat: "markdown",
        result: null,
      }),
    );
    const page = <ParallelTranslateTool defaultTranslateLanguage="English" />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(page);
    document.body.appendChild(container);

    // The server can't see sessionStorage, so its page has no text in it.
    expect(container.querySelector("textarea")?.value).toBe("");

    const mismatches: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, page, {
        onRecoverableError: (error) => mismatches.push(error),
      });
    });

    expect(mismatches).toEqual([]);
    expect(container.querySelector("textarea")?.value).toBe("Kept across a reload.");
    container.remove();
  });
});
