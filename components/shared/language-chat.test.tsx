// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Same shape as Question 434's test: the parts that reach the AI SDK, the
// server, or the Web Speech API are stubbed, so what's left renders the
// real component and exercises its real key handling.
const sendMessage = vi.fn();
const chat = vi.hoisted(() => ({ messages: [] as unknown[] }));
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: chat.messages,
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
vi.mock("@/app/actions/word-lookup-actions", () => ({
  translateWordInContext: vi.fn(),
  lookupWord: vi.fn(),
}));
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({
  addVocabularyEntries: vi.fn(),
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
  chat.messages = [];
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

// On a phone the page is taller than the screen, so anything that scrolls it
// decides what you see (directions2.md, Question 82). Focusing the input takes
// you down to it, which is right in a conversation and wrong before one, when
// the Language field above is what you need. And a new message moves the list
// it arrives in, never the page around it.
describe("where the page sits when the chat opens", () => {
  const said = { id: "m1", role: "user", parts: [{ type: "text", text: "Ciao" }] };

  function openChat() {
    render(<LanguageChat mode="speaking" defaultTranslateLanguage="" />);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    return screen.getByRole("textbox", { name: "" });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("leaves a phone where it is before anything has been said", () => {
    setPointer("coarse");
    expect(openChat()).not.toHaveFocus();
  });

  it("goes to the input on a phone with a conversation to carry on", () => {
    setPointer("coarse");
    chat.messages = [said];
    expect(openChat()).toHaveFocus();
  });

  it("goes to the input with a keyboard, conversation or not", () => {
    setPointer("fine");
    expect(openChat()).toHaveFocus();
  });

  it("does not move the page when a message arrives", () => {
    setPointer("coarse");
    chat.messages = [said];
    openChat();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

// Voice Chat checks the words the browser wrote down, never the sound, so it
// says so beside the microphone and points to the page that listens
// (Answer 54). The written Chat has no microphone, and no such line.
describe("the line about pronunciation", () => {
  const note = /practises what you say, not how you pronounce it/;

  it("is on Voice Chat, pointing to Shadowing Practice", () => {
    render(<LanguageChat mode="speaking" defaultTranslateLanguage="" />);
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shadowing Practice" })).toHaveAttribute(
      "href",
      "/speaking/shadowing",
    );
  });

  it("is not on the written Chat", () => {
    render(<LanguageChat mode="writing" defaultTranslateLanguage="" />);
    expect(screen.queryByText(note)).toBeNull();
  });
});
