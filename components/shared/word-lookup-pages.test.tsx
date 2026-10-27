// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The shared word-lookup window on the two pages that had a window of their
// own before it (Question 55, B1): Flashcards' phrases side and Inline
// Translate. The server is stood in; the pages and the window are real.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/app/actions/shuffle-actions", () => ({
  deleteShuffleCard: vi.fn(() => Promise.resolve()),
  markShuffleListsReviewed: vi.fn(() => Promise.resolve()),
  toggleShuffleCardFavorite: vi.fn(() => Promise.resolve()),
  toggleShuffleCardMemorized: vi.fn(() => Promise.resolve()),
  updateShuffleCardText: vi.fn(() => Promise.resolve()),
}));
const translateWordInContext = vi.fn();
vi.mock("@/app/actions/word-lookup-actions", () => ({
  translateWordInContext: (...args: unknown[]) => translateWordInContext(...args),
  lookupWord: vi.fn(),
}));
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({ addVocabularyEntries: vi.fn() }));
vi.mock("@/app/actions/inline-translate-actions", () => ({ translateMarkedPhrases: vi.fn() }));
vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn() }));
vi.mock("@/app/generated/prisma", () => ({ NotePage: { reading: "reading" } }));

import VocabularyShuffleSession from "./vocabulary-shuffle-session";
import InlineTranslateTool from "./inline-translate-tool";

let call = 0;
beforeEach(() => {
  window.sessionStorage.clear();
  call += 1;
  // A different answer each test, so the window's memory of answers given
  // in this visit never hands one test the last one's.
  translateWordInContext.mockReset().mockResolvedValue({
    ok: true,
    data: { translations: [{ language: "Bulgarian", text: `уморен-${call}` }], languageCode: "de-DE" },
  });
});

describe("Flashcards, phrases side", () => {
  const phrase = "Ich bin müde und möchte schlafen.";

  function review() {
    render(
      <VocabularyShuffleSession
        listId="list-1"
        reviewListIds={["list-1"]}
        type="phrase"
        dashboardPath="/vocabulary/shuffle/phrases"
        listTitle="Phrases"
        cards={[
          {
            id: "card-1",
            listId: "list-1",
            text: phrase,
            memorized: false,
            favorite: false,
            list: { id: "list-1", title: "Phrases", type: "phrase" as const },
          },
        ]}
        defaultTranslateLanguage="Bulgarian"
      />,
    );
  }

  it("opens the shared window on a word, translated first", async () => {
    review();
    fireEvent.click(screen.getByRole("button", { name: "müde" }));
    expect(await screen.findByText(`уморен-${call}`)).toBeInTheDocument();
    expect(translateWordInContext).toHaveBeenCalledWith("müde", phrase, ["Bulgarian"]);
    expect(screen.getByRole("button", { name: "Definition and examples" })).toBeInTheDocument();
  });

  it("keeps the card while the window is open, where Enter used to move on behind it", async () => {
    review();
    fireEvent.click(screen.getByRole("button", { name: "müde" }));
    // The test before looked up the same word in the same phrase, so this
    // one may get the remembered answer rather than a new one.
    await screen.findByText(/^уморен-/);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("button", { name: "schlafen" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.queryByRole("button", { name: "schlafen" })).toBeNull();
  });
});

describe("Inline Translate", () => {
  it("opens the shared window on a right-clicked word, for its sentence", async () => {
    render(<InlineTranslateTool defaultTranslateLanguage="Bulgarian" />);
    fireEvent.change(screen.getByPlaceholderText("Paste your text here..."), {
      target: { value: "Ich bin müde. Morgen ist ein neuer Tag." },
    });
    fireEvent.contextMenu(screen.getByRole("button", { name: "müde" }));

    expect(await screen.findByText(`уморен-${call}`)).toBeInTheDocument();
    expect(translateWordInContext).toHaveBeenCalledWith("müde", "Ich bin müde.", ["Bulgarian"]);
  });

  it("marks exactly that word when its translation is added to the text", async () => {
    render(<InlineTranslateTool defaultTranslateLanguage="Bulgarian" />);
    fireEvent.change(screen.getByPlaceholderText("Paste your text here..."), {
      target: { value: "Ich bin müde. Du bist müde." },
    });
    const [first, second] = screen.getAllByRole("button", { name: "müde" });
    fireEvent.contextMenu(second);
    await screen.findByText(`уморен-${call}`);
    fireEvent.click(screen.getByRole("button", { name: "+ Add to text" }));

    expect(screen.getByRole("button", { name: "In the text!" })).toBeDisabled();
    const [firstAfter, secondAfter] = screen.getAllByRole("button", { name: "müde" });
    expect(secondAfter.className).toMatch(/font-semibold/);
    expect(firstAfter.className).not.toMatch(/font-semibold/);
    expect(first).toBeDefined();
  });
});
