// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// Same stubs as language-chat.test.tsx, plus a conversation restored with
// its feedback already in it — the state you are in after a message of yours
// has been checked, without needing the AI to check one.
const userMessage = {
  id: "m1",
  role: "user",
  parts: [{ type: "text", text: "Ich habe gestern ins Kino gegangen." }],
};
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [userMessage],
    sendMessage: vi.fn(),
    status: "ready",
    error: null,
    setMessages: vi.fn(),
  }),
}));
vi.mock("@/app/actions/writing-check-actions", () => ({ checkWriting: vi.fn() }));
vi.mock("@/app/actions/chat-translate-actions", () => ({
  translateChatMessage: vi.fn(),
}));
vi.mock("@/app/actions/note-actions", () => ({ upsertNote: vi.fn() }));
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
  useTextToSpeech: () => ({
    supported: true,
    speaking: false,
    speak: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock("@/lib/language-chat-draft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/language-chat-draft")>()),
  readChatDraft: () => ({
    language: "German",
    messages: [userMessage],
    feedback: new Map([
      [
        "m1",
        {
          status: "done",
          corrections: [
            {
              original: "habe",
              corrected: "bin",
              explanation: "Gehen takes sein in the perfect tense.",
            },
            {
              original: "the model paraphrased this one",
              corrected: "something",
              explanation: "A correction whose wording isn't in the message.",
            },
          ],
        },
      ],
    ]),
    noteId: null,
    translateInto: "",
    translations: new Map(),
    speakReplies: true,
    autoSend: false,
    speechRate: 1,
  }),
}));

import LanguageChat from "./language-chat";

// The chats used to list their corrections without ever showing them in
// the sentence you wrote, while Writing Check marked them in place. These
// pin the chat to the same picture.

function openFeedback() {
  render(<LanguageChat mode="writing" defaultTranslateLanguage="" />);
  fireEvent.click(screen.getByTitle("2 things to look at"));
}

describe("a chat message's expanded feedback", () => {
  it("shows your own words with the mistake marked in place", () => {
    openFeedback();
    const mark = screen.getByText("habe", { selector: "mark" });
    expect(mark).toHaveAttribute("title", "Correction 1");
    expect(mark.closest("p")).toHaveTextContent(
      "Ich habe gestern ins Kino gegangen.",
    );
  });

  it("numbers the explanation to match its mark", () => {
    openFeedback();
    const item = document.getElementById("chat-correction-m1-0")!;
    expect(within(item).getByText("1")).toBeInTheDocument();
    expect(within(item).getByText("bin")).toBeInTheDocument();
  });

  it("says when a correction couldn't be marked, instead of numbering it", () => {
    openFeedback();
    const item = document.getElementById("chat-correction-m1-1")!;
    expect(within(item).getByText(/didn't match/)).toBeInTheDocument();
  });

  it("lights up the explanation when its mark is clicked", () => {
    openFeedback();
    Element.prototype.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByText("habe", { selector: "mark" }));
    expect(document.getElementById("chat-correction-m1-0")).toHaveClass("ring-1");
  });
});
