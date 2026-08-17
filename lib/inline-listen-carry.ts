// One-time hand-off from Inline Translate to Inline Listen — sessionStorage,
// consumed exactly once by the receiving page, same shape as
// parallel-listen-carry.ts. Carries the plain passage text and its source
// language directly. Inline Listen no longer needs Inline Translate's
// token/run/translation structure at all (Question 225) — it now displays
// and edits the passage as plain text, the same shape Parallel Listen's own
// Language-by-language mode already uses for a single passage, rather than
// a read-only rendering of Inline Translate's own marked-up result.
const STORAGE_KEY = "inline-listen:carry";

export interface InlineListenCarry {
  text: string;
  sourceLanguage: string;
}

export function writeInlineListenCarry(carry: InlineListenCarry) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(carry));
}

export function readAndClearInlineListenCarry(): InlineListenCarry | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.text !== "string") return null;
    return {
      text: parsed.text,
      sourceLanguage:
        typeof parsed.sourceLanguage === "string"
          ? parsed.sourceLanguage
          : "",
    };
  } catch {
    return null;
  }
}
