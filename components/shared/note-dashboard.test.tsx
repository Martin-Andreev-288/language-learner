// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/app/actions/note-actions", () => ({
  getNote: vi.fn(() =>
    Promise.resolve({ title: "A note", content: "# Heading\n\nSome content." }),
  ),
  upsertNote: vi.fn(() => Promise.resolve()),
  renameNote: vi.fn(() => Promise.resolve()),
  deleteNote: vi.fn(() => Promise.resolve()),
  updateNoteContent: vi.fn(() => Promise.resolve()),
  createNote: vi.fn(() => Promise.resolve()),
  moveNote: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/app/actions/note-folder-actions", () => ({
  createNoteFolder: vi.fn(() => Promise.resolve()),
  renameNoteFolder: vi.fn(() => Promise.resolve()),
  deleteNoteFolder: vi.fn(() => Promise.resolve()),
  moveNoteFolder: vi.fn(() => Promise.resolve()),
  moveNoteToFolder: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/app/actions/word-lookup-actions", () => ({
  translateWordInContext: vi.fn(),
  lookupWord: vi.fn(),
}));
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({
  addVocabularyEntries: vi.fn(),
}));
import NoteDashboard from "./note-dashboard";

// Fullscreen lives in this one shared component, so every notes page gets it
// or none does. Question 441 reported it on Reading but not Listening, which
// is what these check: the button is reachable from all six pages, and it is
// Preview mode — not the page — that decides whether it is on screen.

const data = {
  folders: [],
  notes: [
    {
      id: "note-1",
      title: "A note",
      folderId: null,
      preview: "Some content.",
      createdAt: new Date("2026-09-01").toISOString(),
      updatedAt: new Date("2026-09-02").toISOString(),
    },
  ],
};

const PAGES = [
  "general",
  "reading",
  "writing",
  "vocabulary",
  "listening",
  "speaking",
] as const;

beforeEach(() => {
  // jsdom implements neither, and the component calls both.
  Element.prototype.requestFullscreen = vi.fn(() => Promise.resolve());
  document.exitFullscreen = vi.fn(() => Promise.resolve());
});

async function openTheNote() {
  fireEvent.click(screen.getByText("A note"));
  // The editor modal opens once getNote resolves. Waiting on the heading
  // rather than a textbox: the modal holds two (title and content), so a
  // role query matches both and throws before it can settle.
  await waitFor(() => expect(screen.getByText("Edit note")).toBeInTheDocument());
}

// Matches both wordings the button carries ("Fullscreen" in Preview,
// "Fullscreen (switches to Preview)" in Write). Anchored, so it cannot also
// match the "Exit fullscreen" button shown while fullscreen is open.
const fullscreenButton = () => screen.getByTitle(/^Fullscreen/);

describe("the note editor's fullscreen button", () => {
  it.each(PAGES)("is on the %s notes page in both modes", async (page) => {
    render(<NoteDashboard page={page} data={data} defaultTranslateLanguage="" />);
    await openTheNote();

    // Present while writing, which is the half Question 441 was missing.
    expect(fullscreenButton()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(fullscreenButton()).toBeInTheDocument();
  });

  it("asks the browser for fullscreen when clicked in Preview", async () => {
    render(<NoteDashboard page="listening" data={data} defaultTranslateLanguage="" />);
    await openTheNote();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(fullscreenButton());

    expect(Element.prototype.requestFullscreen).toHaveBeenCalled();
  });

  it("switches to Preview first when clicked while writing", async () => {
    render(<NoteDashboard page="listening" data={data} defaultTranslateLanguage="" />);
    await openTheNote();

    // The markdown heading is only rendered by the preview, so finding it
    // proves the mode actually changed rather than just the button firing.
    expect(screen.queryByRole("heading", { name: "Heading" })).not.toBeInTheDocument();

    fireEvent.click(fullscreenButton());

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(Element.prototype.requestFullscreen).toHaveBeenCalled(),
    );
  });

  it("does not ask for fullscreen on its own when Preview is opened normally", async () => {
    render(<NoteDashboard page="reading" data={data} defaultTranslateLanguage="" />);
    await openTheNote();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(Element.prototype.requestFullscreen).not.toHaveBeenCalled();
  });
});
