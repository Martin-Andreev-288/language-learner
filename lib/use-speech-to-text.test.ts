// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpeechToText, wordsNotYetWritten } from "./use-speech-to-text";

// What the hook says when a dictation ends without you (Questions 37 and
// 38). The browser's speech recognition is a stand-in that delivers results
// and failures when the test says so — including after Stop, which is when
// Chrome often sends the last words, and sometimes a "network" failure.

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  stop() {}
  abort() {}
  say(transcript: string) {
    const result = Object.assign([{ transcript }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
});

const longPause = /long pause/;

describe("useSpeechToText's long-pause stop", () => {
  it("still ends a dictation left running through a long silence", () => {
    const { result } = renderHook(() => useSpeechToText({ lang: "de-DE", onFinalResult: vi.fn() }));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(46_000));
    expect(result.current.notice).toMatch(longPause);
    expect(result.current.listening).toBe(false);
  });

  it("says nothing about a pause after you pressed Stop, even when the last words come late", () => {
    const onFinalResult = vi.fn();
    const { result } = renderHook(() => useSpeechToText({ lang: "de-DE", onFinalResult }));
    act(() => result.current.start());
    act(() => result.current.stop());
    // The last words, arriving after Stop, and then the session's end.
    act(() => FakeRecognition.last!.say("Ich bin müde."));
    act(() => FakeRecognition.last!.onend?.());
    act(() => vi.advanceTimersByTime(46_000));

    expect(onFinalResult).toHaveBeenCalledWith("Ich bin müde.");
    expect(result.current.notice).toBeNull();
  });
});

describe("useSpeechToText's failures", () => {
  it("reports a session the speech service ended, naming the page's own button", () => {
    const { result } = renderHook(() =>
      useSpeechToText({ lang: "de-DE", onFinalResult: vi.fn(), startLabel: "Record" }),
    );
    act(() => result.current.start());
    act(() => FakeRecognition.last!.fail("network"));
    expect(result.current.notice).toBe(
      "Dictation stopped — the speech service ended the session. Press Record to carry on.",
    );
  });

  it("names Dictate when the page doesn't say", () => {
    const { result } = renderHook(() => useSpeechToText({ lang: "de-DE", onFinalResult: vi.fn() }));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(46_000));
    expect(result.current.notice).toMatch(/press Dictate/);
  });

  it("says nothing about a failure after you pressed Stop", () => {
    const { result } = renderHook(() => useSpeechToText({ lang: "de-DE", onFinalResult: vi.fn() }));
    act(() => result.current.start());
    act(() => result.current.stop());
    act(() => FakeRecognition.last!.fail("network"));
    expect(result.current.notice).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

// Question 58: on Android, each new piece of dictation repeats the earlier
// words of the same sentence. This is the sequence from that screenshot.
const androidPieces = [
  "bonjour",
  "bonjour comment",
  "comment ça va",
  "il",
  "il y",
  "il y a",
  "il y a le",
  "il y a le problème",
  "il y a le problème",
];

describe("wordsNotYetWritten", () => {
  it("cuts each piece back to its new words", () => {
    let written = "";
    const added: string[] = [];
    for (const piece of androidPieces) {
      const fresh = wordsNotYetWritten(written, piece);
      if (fresh) {
        added.push(fresh);
        written = `${written} ${fresh}`;
      }
    }
    expect(added.join(" ")).toBe("bonjour comment ça va il y a le problème");
  });

  it("ignores case and punctuation when comparing", () => {
    expect(wordsNotYetWritten("Il y a le", "il y a le Problème.")).toBe("Problème.");
  });

  it("keeps a piece that repeats nothing, and drops one that only repeats", () => {
    expect(wordsNotYetWritten("bonjour", "merci beaucoup")).toBe("merci beaucoup");
    expect(wordsNotYetWritten("il y a le problème", "le problème")).toBe("");
  });
});

describe("useSpeechToText on Android", () => {
  const setUserAgent = (value: string) =>
    Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
  afterEach(() => {
    delete (window.navigator as unknown as { userAgent?: string }).userAgent;
  });

  function dictate() {
    const onFinalResult = vi.fn();
    const { result } = renderHook(() => useSpeechToText({ lang: "fr-FR", onFinalResult }));
    act(() => result.current.start());
    for (const piece of androidPieces) act(() => FakeRecognition.last!.say(piece));
    return onFinalResult.mock.calls.map(([chunk]) => chunk).join(" ");
  }

  it("writes each word once, though the phone repeats them", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36");
    expect(dictate()).toBe("bonjour comment ça va il y a le problème");
  });

  it("leaves a computer's pieces exactly as they come", () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36");
    expect(dictate()).toBe(androidPieces.join(" "));
  });
});
