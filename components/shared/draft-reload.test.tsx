// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

// A full page load (a reload, or typing the address) of a page that keeps a
// draft of itself in sessionStorage. The server draws the page without the
// draft — it can't see the tab's storage — and the browser takes that page
// over. These pages used to read the draft in that very first browser
// render, so the two disagreed and React reported a mismatch (error #418)
// and redrew everything. Now they match the server first and restore after.
//
// Each case checks four things: the server's page has no draft in it (in
// this test environment the "server" can see sessionStorage, so this is
// what proves the page doesn't look), no mismatch, the draft is on screen
// in the end, and the stored draft is still there — the first, draft-less
// draw must never save itself over it.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/actions/inline-translate-actions", () => ({
  translateMarkedPhrases: vi.fn(),
}));
vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn(), upsertNote: vi.fn() }));
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({
  addVocabularyEntries: vi.fn(),
}));
vi.mock("@/app/actions/writing-check-actions", () => ({ checkWriting: vi.fn() }));
vi.mock("@/app/actions/chat-translate-actions", () => ({
  translateChatMessage: vi.fn(),
}));
vi.mock("@/app/generated/prisma", () => ({
  NotePage: { reading: "reading", writing: "writing", speaking: "speaking" },
}));
// The chat's messages come from the AI SDK's hook; this stand-in simply
// shows whatever conversation the page starts it with.
vi.mock("@ai-sdk/react", () => ({
  useChat: (options?: { messages?: unknown[] }) => ({
    messages: options?.messages ?? [],
    sendMessage: vi.fn(),
    status: "ready",
    error: null,
    setMessages: vi.fn(),
  }),
}));
vi.mock("@/lib/use-speech-to-text", () => ({
  useSpeechToText: () => ({
    supported: true,
    listening: false,
    interimTranscript: "",
    error: null,
    notice: null,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock("@/lib/use-text-to-speech", () => ({
  useTextToSpeech: () => ({ supported: true, speaking: false, speak: vi.fn(), stop: vi.fn() }),
}));

import InlineTranslateTool from "./inline-translate-tool";
import LanguageChat from "./language-chat";
import { writeChatCarry } from "@/lib/language-chat-carry";
import { render, screen, cleanup } from "@testing-library/react";

beforeEach(() => {
  window.sessionStorage.clear();
});

async function loadFromServer(page: ReactElement) {
  const container = document.createElement("div");
  const serverHtml = renderToString(page);
  container.innerHTML = serverHtml;
  document.body.appendChild(container);
  const serverText = container.textContent ?? "";

  const mismatches: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, page, {
      onRecoverableError: (error) => mismatches.push(error),
    });
  });
  return { container, serverHtml, serverText, mismatches };
}

const chatDraft = (text: string) =>
  JSON.stringify({
    language: "German",
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }],
    feedback: [["m1", { status: "done", corrections: [] }]],
    noteId: null,
    translateInto: "",
    translations: [],
    speakReplies: true,
    autoSend: false,
    speechRate: 1,
  });

describe("a full page load with a draft in the tab", () => {
  it("Inline Translate: no mismatch, the text comes back, the draft stays", async () => {
    const stored = JSON.stringify({
      text: "Der Kellner bringt den Kaffee.",
      sourceLanguage: "German",
      targetLanguages: ["English"],
      markedIndices: [],
      translations: [],
    });
    window.sessionStorage.setItem("inline-translate:draft", stored);

    const { container, serverHtml, mismatches } = await loadFromServer(
      <InlineTranslateTool defaultTranslateLanguage="" />,
    );

    expect(serverHtml).not.toContain("Der Kellner bringt den Kaffee.");
    expect(mismatches).toEqual([]);
    expect(container.querySelector("textarea")?.value).toBe(
      "Der Kellner bringt den Kaffee.",
    );
    expect(window.sessionStorage.getItem("inline-translate:draft")).toContain(
      "Der Kellner bringt den Kaffee.",
    );
    container.remove();
  });

  for (const [name, mode, key] of [
    ["Chat", "writing", "language-chat:draft"],
    ["Voice Chat", "speaking", "voice-chat:draft"],
  ] as const) {
    it(`${name}: no mismatch, the conversation comes back, the draft stays`, async () => {
      window.sessionStorage.setItem(key, chatDraft("Ich war gestern im Kino."));

      const { container, serverText, mismatches } = await loadFromServer(
        <LanguageChat mode={mode} defaultTranslateLanguage="" />,
      );

      expect(serverText).not.toContain("Ich war gestern im Kino.");
      expect(mismatches).toEqual([]);
      expect(container.textContent).toContain("Ich war gestern im Kino.");
      // The draft-less first draw has no messages, and a chat with no
      // messages clears its stored draft — unless that draw never saves.
      expect(window.sessionStorage.getItem(key)).toContain("Ich war gestern im Kino.");
      container.remove();
    });
  }
});

// "Continue this conversation" on a saved chat note hands the conversation
// over in a one-time carry that clears itself when read, and arrives by a
// click, not a page load. The carry is read in the same place as the draft,
// so it is pinned here too: it must still be read, once, and win over a
// draft that happens to be there.
describe("continuing a saved chat from Notes", () => {
  it("opens the carried conversation, not the draft, and uses the carry up", () => {
    window.sessionStorage.setItem("language-chat:draft", chatDraft("An older draft."));
    writeChatCarry("writing", {
      noteId: "note-1",
      language: "German",
      messages: [
        { id: "c1", role: "user", parts: [{ type: "text", text: "Aus der Notiz." }] },
      ],
      feedback: new Map(),
    });

    render(<LanguageChat mode="writing" defaultTranslateLanguage="" />);

    expect(screen.getByText("Aus der Notiz.")).toBeInTheDocument();
    expect(screen.queryByText("An older draft.")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("language-chat:carry")).toBeNull();
    cleanup();
  });
});
