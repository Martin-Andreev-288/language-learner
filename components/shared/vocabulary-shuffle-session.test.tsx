// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The session imports server actions, which pull in Prisma and auth. None of
// that is what's under test here, so each is replaced by a stub.
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
vi.mock("@/app/actions/word-lookup-actions", () => ({
  translateWordInContext: vi.fn(),
  lookupWord: vi.fn(),
}));
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({
  addVocabularyEntries: vi.fn(),
}));

import VocabularyShuffleSession from "./vocabulary-shuffle-session";
import { updateShuffleCardText } from "@/app/actions/shuffle-actions";

// Editing a card's text used to depend entirely on keys a phone doesn't
// have: Enter saved, Shift+Enter broke the line, Escape cancelled. On a
// touch keyboard that meant no line breaks at all and no way to abandon an
// edit — only to save it. These pin down the fix from both sides, so the
// desktop shortcuts can't quietly break while the phone behaviour is kept.

const card = {
  id: "card-1",
  listId: "list-1",
  text: "brütend — задушен",
  memorized: false,
  favorite: false,
  list: { id: "list-1", title: "Test list", type: "word" as const },
};

function setPointer(kind: "fine" | "coarse") {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === `(pointer: ${kind})`,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderSession() {
  render(
    <VocabularyShuffleSession
      listId="list-1"
      reviewListIds={["list-1"]}
      type="word"
      dashboardPath="/vocabulary/shuffle"
      listTitle="Test list"
      cards={[card]}
      defaultTranslateLanguage=""
    />,
  );
}

function startEditing() {
  fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  return screen.getByRole("textbox");
}

beforeEach(() => {
  vi.mocked(updateShuffleCardText).mockClear();
});

describe("editing a card — with a keyboard", () => {
  beforeEach(() => setPointer("fine"));

  it("saves on Enter", () => {
    renderSession();
    const box = startEditing();
    fireEvent.change(box, { target: { value: "brütend — задушен, замислен" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(updateShuffleCardText).toHaveBeenCalledWith(
      "card-1",
      "brütend — задушен, замислен",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not save on Shift+Enter, which is for a line break", () => {
    renderSession();
    const box = startEditing();
    fireEvent.change(box, { target: { value: "changed" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });

    expect(updateShuffleCardText).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("cancels on Escape", () => {
    renderSession();
    const box = startEditing();
    fireEvent.change(box, { target: { value: "changed" } });
    fireEvent.keyDown(box, { key: "Escape" });

    expect(updateShuffleCardText).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("lists the edit keys while editing, not the card shortcuts it has switched off", () => {
    renderSession();
    expect(screen.getByText("memorized")).toBeInTheDocument();
    startEditing();
    expect(screen.getByText("new line")).toBeInTheDocument();
    expect(screen.getByText("Shift + Enter")).toBeInTheDocument();
    expect(screen.queryByText("memorized")).not.toBeInTheDocument();
  });
});

describe("editing a card — on a touch screen", () => {
  beforeEach(() => setPointer("coarse"));

  it("does not save on Enter, so Enter can break the line", () => {
    renderSession();
    const box = startEditing();
    fireEvent.change(box, { target: { value: "first line" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(updateShuffleCardText).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("still saves from the Save button", () => {
    renderSession();
    const box = startEditing();
    fireEvent.change(box, { target: { value: "first line\nsecond line" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updateShuffleCardText).toHaveBeenCalledWith(
      "card-1",
      "first line\nsecond line",
    );
  });

  it("can be abandoned with a visible Cancel button, keeping the old text", () => {
    renderSession();
    const box = startEditing();
    fireEvent.change(box, { target: { value: "a change I regret" } });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(updateShuffleCardText).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("brütend — задушен")).toBeInTheDocument();
  });
});
