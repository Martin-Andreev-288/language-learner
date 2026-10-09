// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Same shape as Question 434's test: the parts that reach the AI SDK, the
// server, or the Web Speech API are stubbed, so what's left renders the
// real component and exercises its real key handling.
const sendMessage = vi.fn();
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage,
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

import LanguageChat from "./language-chat";

// The message box used to send on Enter unconditionally, with Shift+Enter
// the only way to break a line — a key combination a phone doesn't have.
// These pin down the fix from both sides: a keyboard still sends on plain
// Enter, a touch screen no longer does.

function setPointer(kind: "fine" | "coarse") {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === `(pointer: ${kind})`,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function typeAndPressEnter(shiftKey = false) {
  const box = screen.getByRole("textbox", { name: "" });
  fireEvent.change(box, { target: { value: "hallo" } });
  fireEvent.keyDown(box, { key: "Enter", shiftKey });
  return box;
}

beforeEach(() => {
  sendMessage.mockClear();
});

describe("the chat input — with a keyboard", () => {
  beforeEach(() => setPointer("fine"));

  it("sends on Enter", () => {
    render(<LanguageChat mode="writing" defaultTranslateLanguage="" />);
    typeAndPressEnter();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not send on Shift+Enter, which is for a line break", () => {
    render(<LanguageChat mode="writing" defaultTranslateLanguage="" />);
    const box = typeAndPressEnter(true);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(box).toHaveValue("hallo");
  });
});

describe("the chat input — on a touch screen", () => {
  beforeEach(() => setPointer("coarse"));

  it("does not send on Enter, so Enter can break the line", () => {
    render(<LanguageChat mode="writing" defaultTranslateLanguage="" />);
    const box = typeAndPressEnter();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(box).toHaveValue("hallo");
  });

  it("still sends from the Send button", () => {
    render(<LanguageChat mode="writing" defaultTranslateLanguage="" />);
    const box = screen.getByRole("textbox", { name: "" });
    fireEvent.change(box, { target: { value: "hallo" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
