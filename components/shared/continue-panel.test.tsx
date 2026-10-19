// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ContinuePanel, { type ContinueList } from "./continue-panel";

// The panel sits above everything else on the signed-in home page, so the
// two ways it can go wrong are both visible at once: an empty box on a new
// account, or a row that counts the wrong lists or opens the wrong page.

function list(overrides: Partial<ContinueList>): ContinueList {
  return {
    id: "list",
    title: "List",
    type: "word",
    reviewCount: 0,
    lastReviewedAt: null,
    cardCount: 5,
    ...overrides,
  };
}

// Reviewed once, today: due again tomorrow, so not due now.
const reviewedToday = { reviewCount: 1, lastReviewedAt: new Date() };

describe("ContinuePanel", () => {
  it("renders nothing when nothing is due and no tool was used", () => {
    const { container } = render(
      <ContinuePanel lists={[list(reviewedToday)]} lastTool={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("counts the due lists of each kind and opens that Shuffle page", () => {
    render(
      <ContinuePanel
        lists={[
          list({ id: "w1", title: "Food", cardCount: 4 }),
          list({ id: "w2", title: "Travel", cardCount: 6 }),
          list({ id: "w3", title: "Done today", ...reviewedToday }),
          list({ id: "p1", title: "Greetings", type: "phrase", cardCount: 1 }),
        ]}
        lastTool={null}
      />,
    );

    const words = screen.getByText("2 word lists due · 10 words").closest("a");
    expect(words).toHaveAttribute("href", "/vocabulary/shuffle");
    expect(screen.getByText("Food, Travel")).toBeInTheDocument();

    const phrases = screen.getByText("1 phrase list due · 1 phrase").closest("a");
    expect(phrases).toHaveAttribute("href", "/vocabulary/shuffle/phrases");
  });

  it("never offers an empty list, even one that was never reviewed", () => {
    const { container } = render(
      <ContinuePanel lists={[list({ cardCount: 0 })]} lastTool={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("links back to the last tool on its own when nothing is due", () => {
    render(
      <ContinuePanel
        lists={[]}
        lastTool={{ href: "/writing/chat", name: "Chat" }}
      />,
    );
    expect(screen.getByText("Chat").closest("a")).toHaveAttribute(
      "href",
      "/writing/chat",
    );
    expect(screen.queryByText(/due/)).not.toBeInTheDocument();
  });
});
