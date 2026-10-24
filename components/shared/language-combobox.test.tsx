// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LanguageCombobox from "./language-combobox";

// Question 46: on a phone, opening the keyboard for this field resizes the
// window, and the list's resize handler threw — a resize comes from the
// window, which isn't a node of the page.
describe("LanguageCombobox", () => {
  it("closes its list when the window is resized, without an error", () => {
    render(<LanguageCombobox value="" onChange={vi.fn()} placeholder="e.g. German" />);
    const toggle = screen.getByRole("button", { name: "Show languages" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    expect(() => fireEvent(window, new Event("resize"))).not.toThrow();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
