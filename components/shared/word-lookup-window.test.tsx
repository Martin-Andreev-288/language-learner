// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// The shared word-lookup window (Question 55, chapter B), with its requests
// stood in: the translation, the definition, and saving to Vocabulary.
const translateWordInContext = vi.fn();
const lookupWord = vi.fn();
vi.mock("@/app/actions/word-lookup-actions", () => ({
  translateWordInContext: (...args: unknown[]) => translateWordInContext(...args),
  lookupWord: (...args: unknown[]) => lookupWord(...args),
}));
const addVocabularyEntries = vi.fn();
vi.mock("@/app/actions/vocabulary-entry-actions", () => ({
  addVocabularyEntries: (...args: unknown[]) => addVocabularyEntries(...args),
}));

import WordLookupWindow, { type LookupTarget } from "./word-lookup-window";

// The word on the page, at a place on screen a test can move it from.
function wordOnPage(at = { left: 40, top: 100, bottom: 120 }) {
  const element = document.createElement("span");
  document.body.appendChild(element);
  let place = at;
  element.getBoundingClientRect = () =>
    ({ ...place, right: place.left + 40, width: 40, height: place.bottom - place.top }) as DOMRect;
  return { element, moveTo: (next: typeof at) => (place = next) };
}

let sentence = 0;
// A fresh sentence for every test, so the window's memory of answers given
// in this visit never carries one test's answer into the next.
function target(word = "müde", element = wordOnPage().element): LookupTarget {
  sentence += 1;
  return { word, context: `Ich bin ${word} (${sentence}).`, element };
}

const translated = {
  ok: true,
  data: { translations: [{ language: "Bulgarian", text: "уморен" }], languageCode: "de-DE" },
};

beforeEach(() => {
  translateWordInContext.mockReset().mockResolvedValue(translated);
  lookupWord.mockReset().mockResolvedValue({
    ok: true,
    data: { definition: "Needing rest or sleep.", examples: ["Er ist sehr müde."], languageCode: "de-DE" },
  });
  addVocabularyEntries.mockReset().mockResolvedValue({ added: 1 });
});

function open(props: Partial<Parameters<typeof WordLookupWindow>[0]> = {}) {
  const onClose = vi.fn();
  const view = render(
    <WordLookupWindow
      target={target()}
      translateInto={["Bulgarian"]}
      explainInLanguage="Bulgarian"
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose, ...view };
}

describe("the shared word-lookup window", () => {
  it("translates first, and asks for the definition only when pressed", async () => {
    open();
    expect(await screen.findByText("уморен")).toBeInTheDocument();
    expect(translateWordInContext).toHaveBeenCalledWith("müde", expect.stringContaining("Ich bin müde"), ["Bulgarian"]);
    expect(lookupWord).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Definition and examples" }));
    expect(await screen.findByText("Needing rest or sleep.")).toBeInTheDocument();
    expect(screen.getByText("Er ist sehr müde.")).toBeInTheDocument();
    expect(lookupWord).toHaveBeenCalledWith("müde", expect.any(String), "Bulgarian");
  });

  it("labels each language when there are several", async () => {
    translateWordInContext.mockResolvedValue({
      ok: true,
      data: {
        translations: [
          { language: "Bulgarian", text: "уморен" },
          { language: "English", text: "tired" },
        ],
        languageCode: "de-DE",
      },
    });
    open({ translateInto: ["Bulgarian", "English"] });
    expect(await screen.findByText("tired")).toBeInTheDocument();
    expect(screen.getByText("уморен").closest("li")).toHaveTextContent(/bg/i);
  });

  it("answers in English when the page has no language to translate into", async () => {
    open({ translateInto: [""] });
    await screen.findByText("уморен");
    expect(translateWordInContext).toHaveBeenCalledWith("müde", expect.any(String), ["English"]);
  });

  it("doesn't ask again for a word already looked up in the same sentence", async () => {
    const same = target();
    const first = render(
      <WordLookupWindow target={same} translateInto={["Bulgarian"]} explainInLanguage="" onClose={vi.fn()} />,
    );
    await screen.findByText("уморен");
    first.unmount();
    render(<WordLookupWindow target={same} translateInto={["Bulgarian"]} explainInLanguage="" onClose={vi.fn()} />);
    expect(screen.getByText("уморен")).toBeInTheDocument();
    expect(translateWordInContext).toHaveBeenCalledTimes(1);
  });

  // React's development checks open every window twice; that used to send
  // every lookup twice (Question 67).
  it("asks once when the same word is opened twice at the same moment", async () => {
    render(
      <StrictMode>
        <WordLookupWindow target={target()} translateInto={["Bulgarian"]} explainInLanguage="" onClose={vi.fn()} />
      </StrictMode>,
    );
    expect(await screen.findByText("уморен")).toBeInTheDocument();
    expect(translateWordInContext).toHaveBeenCalledTimes(1);
  });

  it("saves the word under the language it reports, with its translation", async () => {
    open();
    await screen.findByText("уморен");
    fireEvent.click(screen.getByRole("button", { name: "+ Add to vocabulary" }));
    await screen.findByRole("button", { name: "Added!" });
    expect(addVocabularyEntries).toHaveBeenCalledWith("müde", "German", "уморен", "Bulgarian");
  });

  it("saves under the page's own language when it has one", async () => {
    open({ wordLanguage: "Swiss German" });
    await screen.findByText("уморен");
    fireEvent.click(screen.getByRole("button", { name: "+ Add to vocabulary" }));
    await screen.findByRole("button", { name: "Added!" });
    expect(addVocabularyEntries).toHaveBeenCalledWith("müde", "Swiss German", "уморен", "Bulgarian");
  });

  it("says so when the word was already saved", async () => {
    addVocabularyEntries.mockResolvedValue({ added: 0 });
    open();
    await screen.findByText("уморен");
    fireEvent.click(screen.getByRole("button", { name: "+ Add to vocabulary" }));
    expect(await screen.findByText(/Already in your German vocabulary/)).toBeInTheDocument();
  });

  it("offers Add to text only where the page has a passage to add it to", async () => {
    const onAddToText = vi.fn();
    const { unmount } = open();
    await screen.findByText("уморен");
    expect(screen.queryByRole("button", { name: "+ Add to text" })).toBeNull();
    unmount();

    open({ onAddToText });
    await screen.findByText("уморен");
    fireEvent.click(screen.getByRole("button", { name: "+ Add to text" }));
    expect(onAddToText).toHaveBeenCalledWith([{ language: "Bulgarian", text: "уморен" }]);
    expect(screen.getByRole("button", { name: "In the text!" })).toBeDisabled();
  });

  it("shows the server's message when the translation fails", async () => {
    translateWordInContext.mockResolvedValue({ ok: false, error: "Quota used up." });
    open();
    expect(await screen.findByText("Quota used up.")).toBeInTheDocument();
  });

  it("closes on Esc, on a tap outside it, and from its own button", async () => {
    const esc = open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(esc.onClose).toHaveBeenCalled();
    esc.unmount();

    const outside = open();
    fireEvent.pointerDown(document.body, { clientX: 10, clientY: 300 });
    expect(outside.onClose).not.toHaveBeenCalled();
    fireEvent.pointerUp(document.body, { clientX: 12, clientY: 302 });
    expect(outside.onClose).toHaveBeenCalled();
    outside.unmount();

    const inside = open();
    fireEvent.pointerDown(screen.getByRole("dialog"), { clientX: 60, clientY: 130 });
    fireEvent.pointerUp(screen.getByRole("dialog"), { clientX: 60, clientY: 130 });
    expect(inside.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(inside.onClose).toHaveBeenCalled();
  });

  // Question 65: on a phone, moving the page starts as a press outside the
  // window, and closing on that made the window vanish at every scroll.
  it("stays open when a press outside turns out to be a scroll", () => {
    const { onClose } = open();
    // The browser takes the touch over for scrolling…
    fireEvent.pointerDown(document.body, { clientX: 10, clientY: 300 });
    fireEvent.pointerCancel(document.body);
    // …or the press ends far from where it started.
    fireEvent.pointerDown(document.body, { clientX: 10, clientY: 300 });
    fireEvent.pointerUp(document.body, { clientX: 10, clientY: 180 });
    fireEvent.scroll(window);
    fireEvent(window, new Event("resize"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves with its word as the page scrolls, and closes once the word is out of sight", () => {
    const word = wordOnPage({ left: 40, top: 100, bottom: 120 });
    const { onClose } = open({ target: target("müde", word.element) });
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.top).toBe("126px");

    word.moveTo({ left: 40, top: 50, bottom: 70 });
    fireEvent.scroll(window);
    expect(dialog.style.top).toBe("76px");
    expect(onClose).not.toHaveBeenCalled();

    word.moveTo({ left: 40, top: -60, bottom: -40 });
    fireEvent.scroll(window);
    expect(onClose).toHaveBeenCalled();
  });

  // Shadowing's Record button (B3). jsdom's screen is 768 pixels tall.
  it("never covers what the page asks it to keep clear", () => {
    const record = document.createElement("button");
    record.getBoundingClientRect = () => ({ top: 480, bottom: 510, left: 0, right: 200 }) as DOMRect;

    // Plenty of room above the word, little before the button below it:
    // the window goes above.
    const low = wordOnPage({ left: 40, top: 400, bottom: 420 });
    const first = open({ target: target("müde", low.element), keepClear: record });
    expect(screen.getByRole("dialog").style.top).toBe("");
    expect(screen.getByRole("dialog").style.bottom).toBe(`${768 - 400 + 6}px`);
    first.unmount();

    // No room above the word: below it, but ending before the button.
    record.getBoundingClientRect = () => ({ top: 300, bottom: 330, left: 0, right: 200 }) as DOMRect;
    const high = wordOnPage({ left: 40, top: 30, bottom: 50 });
    open({ target: target("müde", high.element), keepClear: record });
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.top).toBe("56px");
    expect(56 + parseFloat(dialog.style.maxHeight)).toBeLessThanOrEqual(300);
  });

  // A chat's conversation scrolls in a box of its own, short on a phone: a
  // word scrolled past its edge is hidden while still on the screen.
  it("closes once its word has scrolled out of the box it scrolls in", () => {
    const box = document.createElement("div");
    box.style.overflowY = "auto";
    box.getBoundingClientRect = () => ({ top: 200, bottom: 400, left: 0, right: 300 }) as DOMRect;
    document.body.appendChild(box);
    const word = wordOnPage({ left: 40, top: 250, bottom: 270 });
    box.appendChild(word.element);
    const { onClose } = open({ target: target("müde", word.element) });

    word.moveTo({ left: 40, top: 210, bottom: 230 });
    fireEvent.scroll(box);
    expect(onClose).not.toHaveBeenCalled();

    word.moveTo({ left: 40, top: 160, bottom: 180 });
    fireEvent.scroll(box);
    expect(onClose).toHaveBeenCalled();
  });

  it("pronounces the word in the language the translation reports", async () => {
    const speak = vi.fn();
    const Utterance = vi.fn(function (this: { text: string; lang: string }, text: string) {
      this.text = text;
    });
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel: vi.fn() },
    });
    open();
    await screen.findByText("уморен");
    fireEvent.click(screen.getByRole("button", { name: "Play pronunciation" }));
    await waitFor(() => expect(speak).toHaveBeenCalled());
    expect(speak.mock.calls[0][0]).toMatchObject({ text: "müde", lang: "de-DE" });
    vi.unstubAllGlobals();
  });

  // Voice Chat reads its replies out loud (B2): a window closing there must
  // stop only the word it said itself.
  it("stops its own word when it closes, and leaves any other speech alone", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      vi.fn(function (this: { text: string }, text: string) {
        this.text = text;
      }),
    );
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak: vi.fn(), cancel },
    });

    const quiet = open();
    await screen.findByText("уморен");
    quiet.unmount();
    expect(cancel).not.toHaveBeenCalled();

    const talking = open();
    await screen.findByText("уморен");
    fireEvent.click(screen.getByRole("button", { name: "Play pronunciation" }));
    const beforeClosing = cancel.mock.calls.length;
    talking.unmount();
    expect(cancel).toHaveBeenCalledTimes(beforeClosing + 1);
    vi.unstubAllGlobals();
  });
});
