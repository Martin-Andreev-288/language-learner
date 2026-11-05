// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GuideLink from "./guide-link";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

// jsdom doesn't implement the browser's modal dialog, so these stand in for
// the two parts of it the window uses: opening it, and closing it — which,
// as in a browser, announces itself with a "close" event.
beforeEach(() => {
  pathname = "/";
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

async function openGuide() {
  fireEvent.click(screen.getByRole("button", { name: /Guide/ }));
  // The window's code is loaded on the first open, which can take a moment
  // when the whole suite is running at once.
  return screen.findByRole("dialog", { name: "Shadowing Practice" }, { timeout: 15000 });
}

describe("GuideLink", () => {
  it("renders nothing on a page without a guide", () => {
    pathname = "/reading";
    const { container } = render(<GuideLink />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens this page's guide in a window, with its steps", async () => {
    pathname = "/speaking/shadowing";
    render(<GuideLink />);
    const dialog = await openGuide();
    expect(dialog).toHaveTextContent("How to use it");
    expect(dialog).toHaveTextContent("Good to know");
    // A button's name, written in bold in the guide's text.
    expect(screen.getByText("Start practicing").tagName).toBe("STRONG");
  });

  it("gives focus back to the pill when it closes", async () => {
    pathname = "/speaking/shadowing";
    render(<GuideLink />);
    await openGuide();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /Guide/ })).toHaveFocus();
  });

  it("lists all the guides, opens another, and goes back to this page's", async () => {
    pathname = "/speaking/shadowing";
    render(<GuideLink />);
    await openGuide();
    fireEvent.click(screen.getByRole("button", { name: "All guides" }));
    const list = screen.getByRole("navigation", { name: "All guides" });
    expect(list).toHaveTextContent("Getting Started");
    expect(list).toHaveTextContent("this page");

    fireEvent.click(screen.getByRole("button", { name: "Word List" }));
    expect(screen.getByRole("heading", { name: "Word List" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "← Back to Shadowing Practice" }));
    expect(screen.getByRole("heading", { name: "Shadowing Practice" })).toBeInTheDocument();
  });

  it("closes on a press on the dimmed page around it, not on one inside it", async () => {
    pathname = "/speaking/shadowing";
    render(<GuideLink />);
    const dialog = await openGuide();
    fireEvent.click(screen.getByText("How to use it"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
