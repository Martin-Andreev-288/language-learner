// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The tool imports server actions, which pull in Prisma and auth. None of
// that is what's under test here, so each is replaced by a stub.
vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn() }));
vi.mock("@/app/actions/shadowing-actions", () => ({
  checkShadowingAttempt: vi.fn(),
  generateShadowingPassage: vi.fn(),
}));
vi.mock("@/app/generated/prisma", () => ({
  NotePage: { speaking: "speaking" },
}));

import ShadowingTool from "./shadowing-tool";

// The generator's four menus and its topic line fold away behind one
// Options line. Folding is only safe if two things hold: the line tells the
// truth about what Generate will ask for, and Generate itself never goes
// behind the fold with them.

function optionsLine() {
  return screen.getByRole("button", { name: /^Options/ });
}

describe("ShadowingTool generator options", () => {
  it("starts folded, with the settings named and Generate in view", () => {
    render(<ShadowingTool />);
    expect(optionsLine()).toHaveAttribute("aria-expanded", "false");
    expect(optionsLine()).toHaveTextContent(
      "Any level · Everyday conversation · Medium passage · Medium sentences",
    );
    expect(screen.queryByLabelText("Level")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  it("opens on click, and the line follows what you change", () => {
    render(<ShadowingTool />);
    fireEvent.click(optionsLine());
    expect(optionsLine()).toHaveAttribute("aria-expanded", "true");

    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "A2" } });
    fireEvent.change(screen.getByLabelText("Passage length"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByPlaceholderText(/^Topic or notes/), {
      target: { value: "ordering at a bakery" },
    });
    expect(optionsLine()).toHaveTextContent(
      "A2 · Everyday conversation · Short passage · Medium sentences · “ordering at a bakery”",
    );
  });

  // Folding hides the fields, not the values: closing and reopening must
  // not put anything back to its default.
  it("keeps what you chose when you fold it again", () => {
    render(<ShadowingTool />);
    fireEvent.click(optionsLine());
    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "B1" } });
    fireEvent.click(optionsLine());
    expect(screen.queryByLabelText("Level")).not.toBeInTheDocument();
    expect(optionsLine()).toHaveTextContent(/^Options\s*B1 ·/);
    fireEvent.click(optionsLine());
    expect(screen.getByLabelText("Level")).toHaveValue("B1");
  });

  it("shows a guest the same line, with sign-in in place of Generate", () => {
    render(<ShadowingTool isAuthenticated={false} />);
    expect(optionsLine()).toHaveTextContent("Any level");
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeInTheDocument();
  });
});
