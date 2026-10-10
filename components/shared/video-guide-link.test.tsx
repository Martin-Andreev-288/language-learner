// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import VideoGuideLink from "./video-guide-link";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

// The three states this strip can be in, and the one that matters most to
// get right is the middle one: before the playlist exists it must still be
// on screen (the videos are recorded with it there), but not as a link that
// goes nowhere.

describe("VideoGuideLink", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("renders nothing on a page without a video", () => {
    pathname = "/reading";
    const { container } = render(<VideoGuideLink playlistUrl="https://example.com/list" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the video as plain text while there is no playlist", () => {
    pathname = "/speaking/shadowing";
    render(<VideoGuideLink playlistUrl="" />);
    expect(screen.getByText(/video "Shadowing Practice"/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links to the playlist in a new tab once there is one", () => {
    pathname = "/notes";
    render(<VideoGuideLink playlistUrl="https://example.com/list" />);
    const link = screen.getByRole("link", { name: /video "Notes"/ });
    expect(link).toHaveAttribute("href", "https://example.com/list");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
