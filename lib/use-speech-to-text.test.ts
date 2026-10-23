// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpeechToText } from "./use-speech-to-text";

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
