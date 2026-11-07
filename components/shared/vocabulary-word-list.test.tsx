// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// The word list imports server actions, which pull in Prisma and auth. None
// of that is what's under test here, so each is replaced by a stub.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({
  addVocabularyEntries: vi.fn(),
  deleteVocabularyEntries: vi.fn(),
  deleteVocabularyEntry: vi.fn(),
  updateVocabularyEntry: vi.fn(),
}));
vi.mock("@/app/actions/shuffle-actions", () => ({
  appendCardsToShuffleList: vi.fn(),
  createShuffleListWithCards: vi.fn(),
  getShuffleLists: vi.fn(async () => []),
}));
vi.mock("@/app/actions/vocabulary-enrich-actions", () => ({
  enrichVocabularyEntries: vi.fn(),
}));
vi.mock("@/app/actions/writing-check-actions", () => ({ checkWriting: vi.fn() }));
vi.mock("@/app/generated/prisma", () => ({
  ShuffleListType: { word: "word", phrase: "phrase" },
}));

import VocabularyWordList from "./vocabulary-word-list";
import {
  deleteVocabularyEntries,
  deleteVocabularyEntry,
} from "@/app/actions/vocabulary-entry-actions";

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

// Rows are newest first: bonjour, Kellner, Kaffee.
function tick(...rows: number[]) {
  for (const row of rows) {
    fireEvent.click(screen.getAllByTitle(/^Select/)[row]);
  }
}

function button(name: string | RegExp) {
  return screen.getByRole("button", { name });
}

describe("deleting several words at once", () => {
  beforeEach(() => {
    vi.mocked(deleteVocabularyEntries).mockReset();
    vi.mocked(deleteVocabularyEntry).mockReset();
  });

  it("asks first, then deletes exactly what is ticked", async () => {
    vi.mocked(deleteVocabularyEntries).mockResolvedValue({ deleted: 2 });
    renderList();
    tick(0, 1);

    fireEvent.click(button("Delete…"));
    expect(screen.getByRole("dialog", { name: "Delete 2 words?" })).toBeInTheDocument();
    expect(deleteVocabularyEntries).not.toHaveBeenCalled();

    fireEvent.click(button("Delete 2 words"));
    expect(await screen.findByText("Deleted 2 words.")).toBeInTheDocument();
    expect(deleteVocabularyEntries).toHaveBeenCalledExactlyOnceWith(["3", "2"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("changes nothing on Cancel", () => {
    renderList();
    tick(0, 1);
    fireEvent.click(button("Delete…"));
    fireEvent.click(button("Cancel"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteVocabularyEntries).not.toHaveBeenCalled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  // A failure keeps the window and the ticks, so trying again is one press.
  it("keeps the selection when it fails, and says so in the window", async () => {
    vi.mocked(deleteVocabularyEntries).mockRejectedValue(new Error("The database is away."));
    renderList();
    tick(0, 1);
    fireEvent.click(button("Delete…"));
    fireEvent.click(button("Delete 2 words"));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("The database is away.")).toBeInTheDocument();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  // Another tab may have deleted one already, so the page reports what the
  // server did rather than repeating what it asked for.
  it("reports how many really went", async () => {
    vi.mocked(deleteVocabularyEntries).mockResolvedValue({ deleted: 1 });
    renderList();
    tick(0, 1);
    fireEvent.click(button("Delete…"));
    fireEvent.click(button("Delete 2 words"));
    expect(await screen.findByText("Deleted 1 word.")).toBeInTheDocument();
  });

  it("warns when a filter is hiding some of the ticked words", () => {
    renderList();
    tick(0, 1);
    openFilters();
    fireEvent.click(screen.getByRole("checkbox", { name: "German" }));
    expect(screen.queryByText("bonjour")).not.toBeInTheDocument();

    fireEvent.click(button("Delete…"));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "1 of them is hidden by your filters or search right now.",
    );
  });

  it("does not warn when every ticked word is on screen", () => {
    renderList();
    tick(0, 1);
    fireEvent.click(button("Delete…"));
    expect(screen.getByRole("dialog")).not.toHaveTextContent("hidden");
  });

  it("speaks of one word when one is ticked", () => {
    renderList();
    tick(0);
    fireEvent.click(button("Delete…"));
    expect(screen.getByRole("dialog", { name: "Delete 1 word?" })).toHaveTextContent(
      "This permanently deletes it, with its translations",
    );
  });

  // The ✕ on a row deletes one word at once; if that word was ticked, the bar
  // must not go on counting something that no longer exists.
  it("drops a word from the selection when its own ✕ deletes it", async () => {
    vi.mocked(deleteVocabularyEntry).mockResolvedValue({} as never);
    renderList();
    tick(0, 1);
    fireEvent.click(screen.getAllByTitle("Delete")[0]);
    expect(await screen.findByText("1 selected")).toBeInTheDocument();
  });
});

// jsdom has no layout and no real fullscreen, so these pin the two facts the
// bug came from: the toolbar's offset, and where the floating windows live.
describe("in fullscreen", () => {
  const requestFullscreen = vi.fn(() => Promise.resolve());
  let fullscreenElement: Element | null = null;

  beforeEach(() => {
    requestFullscreen.mockClear();
    fullscreenElement = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Element.prototype.requestFullscreen = requestFullscreen;
  });

  // The browser answers a request with an event, so the test does the same.
  function pressFullscreen() {
    fireEvent.click(button("Fullscreen"));
    fullscreenElement = requestFullscreen.mock.contexts[0] as unknown as Element;
    fireEvent(document, new Event("fullscreenchange"));
    return fullscreenElement as HTMLElement;
  }

  function goFullscreen() {
    renderList();
    fireEvent.click(button("Table"));
    return pressFullscreen();
  }

  function toolbar() {
    return screen.getByText("3 words").closest(".sticky");
  }

  // There is no navbar in fullscreen, and the offset that keeps this toolbar
  // below one pushed it down over the selection bar and Exit fullscreen.
  it("keeps the toolbar at the very top, with no room left for a navbar", () => {
    renderList();
    expect(toolbar()).toHaveClass("top-(--nav-height)");

    fireEvent.click(button("Table"));
    pressFullscreen();
    expect(toolbar()).toHaveClass("top-0");
    expect(toolbar()).not.toHaveClass("top-(--nav-height)");
  });

  // The browser shows the fullscreen element and nothing else, so a window
  // opened from outside it exists but can't be seen.
  it("opens each window inside the card, the only thing the browser shows", () => {
    const card = goFullscreen();
    tick(0, 1);

    fireEvent.click(button("Add information…"));
    expect(within(card).getByRole("button", { name: "Generate" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(button("Send to Flashcards…"));
    expect(within(card).getByRole("button", { name: "Send" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(button("Delete…"));
    expect(within(card).getByRole("dialog")).toBeInTheDocument();
  });

  it("opens a column's filter inside the card too", async () => {
    const card = goFullscreen();
    fireEvent.click(card.querySelector("thead th button")!);
    await waitFor(() =>
      expect(card.querySelector(".fixed.max-h-72")).toBeInTheDocument(),
    );
  });
});
