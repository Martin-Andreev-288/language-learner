// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Who is signed in, as the page's auth() call will see it. Changing this and
// re-rendering the page is what a sign-out does: the server renders the
// same route again, for nobody.
let currentSession: { user: { id: string } } | null = null;
vi.mock("@/auth", () => ({ auth: vi.fn(async () => currentSession) }));
vi.mock("@/app/actions/feedback-actions", () => ({
  sendFeedback: vi.fn(async () => ({ ok: true, data: undefined })),
}));

import ContactPage from "./page";

// Question 444: send a message while signed in, sign out in the same
// window, and the page still said "Thank you — that sent." — with the name
// and email the form keeps for "Send another" still behind it.

async function renderPage() {
  return render(await ContactPage());
}

async function sendAMessage() {
  fireEvent.change(document.getElementById("feedback-name")!, {
    target: { value: "Martin" },
  });
  fireEvent.change(document.getElementById("feedback-email")!, {
    target: { value: "martin@example.com" },
  });
  fireEvent.change(document.getElementById("feedback-message")!, {
    target: { value: "Found a bug." },
  });
  fireEvent.submit(document.querySelector("form")!);
  await screen.findByText("Thank you — that sent.");
}

beforeEach(() => {
  currentSession = null;
});

describe("the contact form across a change of who is signed in", () => {
  it("starts clean after signing out", async () => {
    currentSession = { user: { id: "user-1" } };
    const { rerender } = await renderPage();
    await sendAMessage();

    currentSession = null; // sign out
    rerender(await ContactPage());

    expect(screen.queryByText("Thank you — that sent.")).not.toBeInTheDocument();
    // The details kept for "Send another" are gone too — not just hidden
    // behind the success panel.
    expect(document.getElementById("feedback-name")).toHaveValue("");
    expect(document.getElementById("feedback-email")).toHaveValue("");
  });

  it("starts clean when someone else signs in", async () => {
    currentSession = { user: { id: "user-1" } };
    const { rerender } = await renderPage();
    await sendAMessage();

    currentSession = { user: { id: "user-2" } };
    rerender(await ContactPage());

    expect(screen.queryByText("Thank you — that sent.")).not.toBeInTheDocument();
    expect(document.getElementById("feedback-email")).toHaveValue("");
  });

  it("keeps the success panel for the same person, as before", async () => {
    currentSession = { user: { id: "user-1" } };
    const { rerender } = await renderPage();
    await sendAMessage();

    // Same person, page rendered again (any server refresh) — nothing changes.
    rerender(await ContactPage());

    expect(screen.getByText("Thank you — that sent.")).toBeInTheDocument();
  });

  it("still keeps name and email for Send another, for the same person", async () => {
    currentSession = { user: { id: "user-1" } };
    await renderPage();
    await sendAMessage();

    fireEvent.click(screen.getByRole("button", { name: "Send another" }));

    expect(document.getElementById("feedback-name")).toHaveValue("Martin");
    expect(document.getElementById("feedback-email")).toHaveValue("martin@example.com");
    expect(document.getElementById("feedback-message")).toHaveValue("");
  });
});
