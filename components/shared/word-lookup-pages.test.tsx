// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The shared word-lookup window on the pages that offer it (Question 55):
// Flashcards' phrases side and Inline Translate, which had a window of
// their own before it (B1), and the replies in Chat and Voice Chat (B2).
// The server, the AI SDK and the browser's speech are stood in; the pages
// and the window are real.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/app/actions/shuffle-actions", () => ({
  deleteShuffleCard: vi.fn(() => Promise.resolve()),
  markShuffleListsReviewed: vi.fn(() => Promise.resolve()),
  toggleShuffleCardFavorite: vi.fn(() => Promise.resolve()),
  toggleShuffleCardMemorized: vi.fn(() => Promise.resolve()),
  updateShuffleCardText: vi.fn(() => Promise.resolve()),
}));
const translateWordInContext = vi.fn();
vi.mock("@/app/actions/word-lookup-actions", () => ({
  translateWordInContext: (...args: unknown[]) => translateWordInContext(...args),
  lookupWord: vi.fn(),
}));
const addVocabularyEntries = vi.fn();
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({
  addVocabularyEntries: (...args: unknown[]) => addVocabularyEntries(...args),
}));
vi.mock("@/app/actions/inline-translate-actions", () => ({ translateMarkedPhrases: vi.fn() }));
vi.mock("@/app/actions/note-actions", () => ({ createNote: vi.fn(), upsertNote: vi.fn() }));
vi.mock("@/app/actions/writing-check-actions", () => ({ checkWriting: vi.fn() }));
vi.mock("@/app/actions/chat-translate-actions", () => ({ translateChatMessage: vi.fn() }));
vi.mock("@/app/generated/prisma", () => ({ NotePage: { reading: "reading" } }));
// The conversation on screen, and whether its newest reply is still
// arriving, set by each chat test.
const chat: { messages: unknown[]; status: string } = { messages: [], status: "ready" };
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: chat.messages,
    status: chat.status,
    sendMessage: vi.fn(),
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

import VocabularyShuffleSession from "./vocabulary-shuffle-session";
import InlineTranslateTool from "./inline-translate-tool";
import LanguageChat from "./language-chat";
import { writeChatCarry } from "@/lib/language-chat-carry";
import type { ChatMode } from "@/lib/language-chat-mode";

let call = 0;
beforeEach(() => {
  window.sessionStorage.clear();
  call += 1;
  // A different answer each test, so the window's memory of answers given
  // in this visit never hands one test the last one's.
  translateWordInContext.mockReset().mockResolvedValue({
    ok: true,
    data: { translations: [{ language: "Bulgarian", text: `уморен-${call}` }], languageCode: "de-DE" },
  });
  addVocabularyEntries.mockReset().mockResolvedValue({ added: 1 });
  chat.status = "ready";
});

describe("Flashcards, phrases side", () => {
  const phrase = "Ich bin müde und möchte schlafen.";

  function review() {
    render(
      <VocabularyShuffleSession
        listId="list-1"
        reviewListIds={["list-1"]}
        type="phrase"
        dashboardPath="/vocabulary/shuffle/phrases"
        listTitle="Phrases"
        cards={[
          {
            id: "card-1",
            listId: "list-1",
            text: phrase,
            memorized: false,
            favorite: false,
            list: { id: "list-1", title: "Phrases", type: "phrase" as const },
          },
        ]}
        defaultTranslateLanguage="Bulgarian"
      />,
    );
  }

  it("opens the shared window on a word, translated first", async () => {
    review();
    fireEvent.click(screen.getByRole("button", { name: "müde" }));
    expect(await screen.findByText(`уморен-${call}`)).toBeInTheDocument();
    expect(translateWordInContext).toHaveBeenCalledWith("müde", phrase, ["Bulgarian"]);
    expect(screen.getByRole("button", { name: "Definition and examples" })).toBeInTheDocument();
  });

  it("keeps the card while the window is open, where Enter used to move on behind it", async () => {
    review();
    fireEvent.click(screen.getByRole("button", { name: "müde" }));
    // The test before looked up the same word in the same phrase, so this
    // one may get the remembered answer rather than a new one.
    await screen.findByText(/^уморен-/);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("button", { name: "schlafen" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.queryByRole("button", { name: "schlafen" })).toBeNull();
  });
});

describe("Inline Translate", () => {
  it("opens the shared window on a right-clicked word, for its sentence", async () => {
    render(<InlineTranslateTool defaultTranslateLanguage="Bulgarian" />);
    fireEvent.change(screen.getByPlaceholderText("Paste your text here..."), {
      target: { value: "Ich bin müde. Morgen ist ein neuer Tag." },
    });
    fireEvent.contextMenu(screen.getByRole("button", { name: "müde" }));

    expect(await screen.findByText(`уморен-${call}`)).toBeInTheDocument();
    expect(translateWordInContext).toHaveBeenCalledWith("müde", "Ich bin müde.", ["Bulgarian"]);
  });

  it("marks exactly that word when its translation is added to the text", async () => {
    render(<InlineTranslateTool defaultTranslateLanguage="Bulgarian" />);
    fireEvent.change(screen.getByPlaceholderText("Paste your text here..."), {
      target: { value: "Ich bin müde. Du bist müde." },
    });
    const [first, second] = screen.getAllByRole("button", { name: "müde" });
    fireEvent.contextMenu(second);
    await screen.findByText(`уморен-${call}`);
    fireEvent.click(screen.getByRole("button", { name: "+ Add to text" }));

    expect(screen.getByRole("button", { name: "In the text!" })).toBeDisabled();
    const [firstAfter, secondAfter] = screen.getAllByRole("button", { name: "müde" });
    expect(secondAfter.className).toMatch(/font-semibold/);
    expect(firstAfter.className).not.toMatch(/font-semibold/);
    expect(first).toBeDefined();
  });
});

describe("Chat and Voice Chat replies", () => {
  const question = "Wie geht es dir?";
  // A fresh sentence for every test, for the same reason as the answers.
  const reply = () => `Ich bin heute sehr müde (${call}). Und du?`;

  // A German conversation handed over the way "Continue this conversation"
  // on a saved note hands one over.
  function converse(mode: ChatMode = "writing") {
    const messages = [
      { id: "u1", role: "user" as const, parts: [{ type: "text" as const, text: question }] },
      { id: "a1", role: "assistant" as const, parts: [{ type: "text" as const, text: reply() }] },
    ];
    chat.messages = messages;
    writeChatCarry(mode, { noteId: "note-1", language: "German", messages, feedback: new Map() });
    render(<LanguageChat mode={mode} defaultTranslateLanguage="Bulgarian" />);
  }

  it("opens the shared window on a word in a reply, for its sentence", async () => {
    converse();
    fireEvent.click(screen.getByText("müde"));
    expect(await screen.findByText(`уморен-${call}`)).toBeInTheDocument();
    expect(translateWordInContext).toHaveBeenCalledWith("müde", `Ich bin heute sehr müde (${call}).`, [
      "Bulgarian",
    ]);
  });

  it("saves the word under the chat's language", async () => {
    converse();
    fireEvent.click(screen.getByText("müde"));
    await screen.findByText(`уморен-${call}`);
    fireEvent.click(screen.getByRole("button", { name: "+ Add to vocabulary" }));
    await screen.findByRole("button", { name: "Added!" });
    expect(addVocabularyEntries).toHaveBeenCalledWith("müde", "German", `уморен-${call}`, "Bulgarian");
  });

  it("leaves your own messages as they are", () => {
    converse();
    // Whole, not cut into words — and a click on it opens nothing.
    fireEvent.click(screen.getByText(question));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(translateWordInContext).not.toHaveBeenCalled();
  });

  it("doesn't open when the click ends a text selection, which is for copying", () => {
    converse();
    const selection = vi
      .spyOn(window, "getSelection")
      .mockReturnValue({ toString: () => "sehr müde" } as Selection);
    fireEvent.click(screen.getByText("müde"));
    expect(screen.queryByRole("dialog")).toBeNull();
    selection.mockRestore();
  });

  it("waits until a reply has finished arriving", () => {
    chat.status = "streaming";
    converse();
    fireEvent.click(screen.getByText(reply()));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(translateWordInContext).not.toHaveBeenCalled();
  });

  it("works in Voice Chat too, and closing it doesn't silence a reply being read out", async () => {
    const cancel = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak: vi.fn(), cancel, resume: vi.fn() },
    });
    converse("speaking");
    fireEvent.click(screen.getByText("müde"));
    await screen.findByText(`уморен-${call}`);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cancel).not.toHaveBeenCalled();
  });
});
