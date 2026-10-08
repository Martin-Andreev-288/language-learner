// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CharacterCount from "./character-count";

// This suite exists as much to prove the setup works as to test the
// component: it is the half of the install that can actually break. The
// pure-function tests would pass with nothing but Vitest, whereas rendering
// this needs @vitejs/plugin-react to compile the JSX, jsdom to supply a
// document, React Testing Library to query it, and jest-dom for the
// matchers — four of the seven packages, all at once.
//
// The component is a good subject on its own terms, because the thing worth
// protecting about it is when it says *nothing*. A counter that appears too
// early is noise under every empty box in the app, and no type checker or
// build step has an opinion about that.

describe("CharacterCount", () => {
  it("says nothing while the value is well short of the limit", () => {
    const { container } = render(<CharacterCount value={"a".repeat(10)} max={100} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("still says nothing one character below the threshold", () => {
    // 74 of 100, against a default showFrom of 0.75.
    const { container } = render(<CharacterCount value={"a".repeat(74)} max={100} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("appears once the value reaches the threshold", () => {
    render(<CharacterCount value={"a".repeat(75)} max={100} />);
    expect(screen.getByText(/75 \/ 100 characters/)).toBeInTheDocument();
  });

  it("honours a threshold passed in", () => {
    render(<CharacterCount value={"a".repeat(50)} max={100} showFrom={0.5} />);
    expect(screen.getByText(/50 \/ 100 characters/)).toBeInTheDocument();
  });

  it("says so at the limit, and changes colour", () => {
    render(<CharacterCount value={"a".repeat(100)} max={100} />);
    const counter = screen.getByText(/that's the maximum/);
    expect(counter).toBeInTheDocument();
    expect(counter).toHaveClass("text-amber-400");
  });

  it("stays in the at-limit state past the limit", () => {
    // maxLength on the field should make this unreachable, but the
    // component is handed values by several tools and should not read
    // "101 / 100" as if nothing were wrong.
    render(<CharacterCount value={"a".repeat(101)} max={100} />);
    expect(screen.getByText(/that's the maximum/)).toBeInTheDocument();
  });

  it("does not claim the maximum just below it", () => {
    render(<CharacterCount value={"a".repeat(99)} max={100} />);
    expect(screen.queryByText(/that's the maximum/)).not.toBeInTheDocument();
    expect(screen.getByText(/99 \/ 100 characters/)).toHaveClass("text-zinc-500");
  });

  it("groups the digits of a large limit", () => {
    // The real limits are in the thousands, where "8000 / 10000" is
    // noticeably harder to read at a glance than "8,000 / 10,000".
    render(<CharacterCount value={"a".repeat(8000)} max={10000} />);
    expect(screen.getByText(/8,000 \/ 10,000 characters/)).toBeInTheDocument();
  });
});
