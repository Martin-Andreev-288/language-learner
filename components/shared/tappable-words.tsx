import type { TextToken } from "@/lib/clickable-words";

// Words that open the shared lookup window when tapped (Question 55,
// chapter B), for the pages where the text is read rather than edited:
// Chat and Voice Chat replies, and the Shadowing sentence. The Notes
// preview marks its words the same way from inside its Markdown (see
// lib/rehype-tappable-words.ts).
//
// Plain spans with one tap handler on the text around them, rather than a
// button per word: the words stay ordinary text you can select and copy,
// and a long text doesn't add dozens of stops to the Tab key.

export const TAPPABLE_WORD_CLASS =
  "cursor-pointer rounded transition-colors hover:bg-indigo-600/30 hover:text-indigo-200";

// Each word carries its position in `tokens`, for tappedWord to report.
export function TappableWords({ tokens }: { tokens: TextToken[] }) {
  return tokens.map((token, index) =>
    token.isWord ? (
      <span key={index} data-word={index} className={TAPPABLE_WORD_CLASS}>
        {token.text}
      </span>
    ) : (
      token.text
    ),
  );
}

// The word a tap landed on, for the handler on the text around the words.
// A click that ends a text selection is for copying, not for looking up —
// Parallel Translate's rule.
export function tappedWord(event: React.MouseEvent<HTMLElement>): HTMLElement | null {
  if (window.getSelection()?.toString()) return null;
  return event.target instanceof Element
    ? event.target.closest<HTMLElement>("[data-word]")
    : null;
}
