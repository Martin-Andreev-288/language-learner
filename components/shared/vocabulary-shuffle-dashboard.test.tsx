// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The dashboard imports server actions, which pull in Prisma and auth. None
// of that is what's under test here, so each is replaced by a stub.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/actions/shuffle-actions", () => ({}));
vi.mock("@/app/actions/shuffle-folder-actions", () => ({}));

import VocabularyShuffleDashboard from "./vocabulary-shuffle-dashboard";
import { shuffleReviewBasePath } from "@/lib/shuffle-sides";

// The Words | Phrases switch is the only way to the phrases side: since it
// moved into Vocabulary it has no menu entry of its own. So both links have
// to lead to the right page, and it has to say which side you are on.

const emptyData = {
  folders: [],
  lists: [],
  totals: { lists: 0, cards: 0, memorized: 0, unmemorized: 0, favorites: 0 },
};

function renderSide(type: "word" | "phrase") {
  render(
    <VocabularyShuffleDashboard
      type={type}
      reviewBasePath={shuffleReviewBasePath(type)}
      data={emptyData}
    />,
  );
}

describe("VocabularyShuffleDashboard", () => {
  it("links each side of the switch to its own page", () => {
    renderSide("word");
    expect(screen.getByRole("link", { name: "Words" })).toHaveAttribute(
      "href",
      "/vocabulary/shuffle",
    );
    expect(screen.getByRole("link", { name: "Phrases" })).toHaveAttribute(
      "href",
      "/vocabulary/shuffle/phrases",
    );
  });

  it("marks the side you are on, and only that one", () => {
    renderSide("phrase");
    expect(screen.getByRole("link", { name: "Phrases" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Words" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  // The heading is the menu entry's own name, so the page and the menu say
  // the same thing, on either side.
  it("heads both sides with the menu's name for the page", () => {
    for (const side of ["word", "phrase"] as const) {
      const { unmount } = render(
        <VocabularyShuffleDashboard
          type={side}
          reviewBasePath={shuffleReviewBasePath(side)}
          data={emptyData}
        />,
      );
      expect(
        screen.getByRole("heading", { level: 1, name: "Flashcards" }),
      ).toBeInTheDocument();
      unmount();
    }
  });
});
