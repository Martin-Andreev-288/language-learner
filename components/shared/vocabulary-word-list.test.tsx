// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// The word list imports server actions, which pull in Prisma and auth. None
// of that is what's under test here, so each is replaced by a stub.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({
  addVocabularyEntries: vi.fn(),
  deleteVocabularyEntry: vi.fn(),
  updateVocabularyEntry: vi.fn(),
}));
vi.mock("@/app/actions/shuffle-actions", () => ({
  appendCardsToShuffleList: vi.fn(),
  createShuffleListWithCards: vi.fn(),
}));
vi.mock("@/app/actions/vocabulary-enrich-actions", () => ({
  enrichVocabularyEntries: vi.fn(),
}));
vi.mock("@/app/actions/writing-check-actions", () => ({ checkWriting: vi.fn() }));
vi.mock("@/app/generated/prisma", () => ({
  ShuffleListType: { word: "word", phrase: "phrase" },
}));

import VocabularyWordList from "./vocabulary-word-list";

// The language filter, the enrichment filter and the sort sit behind one
// Filters button. The risk in hiding them is a shorter list with no visible
// reason, so what matters most is the count on the button: it has to say
// when something is hiding words, and only then.

const blank = {
  level: null,
  nounInfo: null,
  partOfSpeech: null,
  wordFamily: null,
  synonyms: null,
  aiExamples: null,
  collocations: null,
  usedIn: null,
  category: null,
  ownExample: null,
};

const entries = [
  { ...blank, id: "1", word: "Kaffee", language: "German", firstSeen: "2026-10-01", translations: [] },
  { ...blank, id: "2", word: "Kellner", language: "German", firstSeen: "2026-10-02", level: "A2", translations: [] },
  { ...blank, id: "3", word: "bonjour", language: "French", firstSeen: "2026-10-03", translations: [] },
];

function renderList() {
  render(<VocabularyWordList entries={entries} defaultTranslateLanguage="" />);
}

function filtersButton() {
  return screen.getByRole("button", { name: /^Filters/ });
}

function openFilters() {
  fireEvent.click(filtersButton());
}

describe("VocabularyWordList filters", () => {
  it("keeps search on the toolbar and the rest behind the button", () => {
    renderList();
    expect(screen.getByPlaceholderText("Search word or translation…")).toBeInTheDocument();
    expect(filtersButton()).toHaveTextContent(/^Filters▾$/);
    expect(screen.queryByText("Languages")).not.toBeInTheDocument();
  });

  it("counts each filter that hides words", () => {
    renderList();
    openFilters();

    fireEvent.click(screen.getByRole("checkbox", { name: "German" }));
    expect(filtersButton()).toHaveTextContent("Filters · 1");
    expect(screen.queryByText("bonjour")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(filtersButton()).toHaveTextContent("Filters · 2");
    expect(screen.getByText("Kaffee")).toBeInTheDocument();
    expect(screen.queryByText("Kellner")).not.toBeInTheDocument();
  });

  // Sorting reorders without hiding anything, so a count there would send
  // you looking for words that are all still on screen.
  it("does not count the sort", () => {
    renderList();
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "A–Z" }));
    expect(filtersButton()).toHaveTextContent(/^Filters▾$/);
  });

  it("puts everything back with Reset all", () => {
    renderList();
    openFilters();
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    fireEvent.click(screen.getByRole("button", { name: "Added" }));
    fireEvent.click(screen.getByRole("button", { name: "A–Z" }));

    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(filtersButton()).toHaveTextContent(/^Filters▾$/);
    expect(screen.getByRole("button", { name: "Recently added" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const word of ["Kaffee", "Kellner", "bonjour"]) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
  });

  it("closes on Escape and on a click outside", () => {
    renderList();
    openFilters();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Languages")).not.toBeInTheDocument();

    openFilters();
    const panel = screen.getByText("Languages").closest("div")!;
    fireEvent.mouseDown(within(panel).getByText("Languages"));
    expect(screen.getByText("Languages")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Languages")).not.toBeInTheDocument();
  });
});
