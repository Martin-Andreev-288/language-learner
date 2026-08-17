// Keeps Inline Translate's pasted text, language fields, marked words, and
// last translation result alive across a page navigation — sessionStorage,
// not a database: gone once the tab closes, which is exactly "for a while,
// not necessarily forever." Unlike parallel-listen-carry.ts, this isn't a
// one-time, read-and-clear hand-off between two pages — it's a draft of the
// same page, rewritten on every change and read back whenever the page is
// opened again.
//
// Marked words are stored as plain token positions (`markedIndices`), and
// the translation result as `[phrase, translation]` pairs — not the
// tokens/runs a result also carries at runtime, since those are cheaply
// recomputed from the restored text and marks with the same
// `tokenizeWords`/`groupMarkedRuns` calls a fresh translation already uses.
// Storing only what can't be derived keeps the draft small and keeps there
// from being two sources of truth for the same tokens.
const STORAGE_KEY = "inline-translate:draft";

export interface InlineTranslateDraft {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  markedIndices: number[];
  translations: [string, string][];
}

const EMPTY_DRAFT: InlineTranslateDraft = {
  text: "",
  sourceLanguage: "",
  targetLanguage: "",
  markedIndices: [],
  translations: [],
};

export function readInlineTranslateDraft(): InlineTranslateDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY_DRAFT;
  try {
    const parsed = JSON.parse(raw);
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      sourceLanguage:
        typeof parsed.sourceLanguage === "string" ? parsed.sourceLanguage : "",
      targetLanguage:
        typeof parsed.targetLanguage === "string" ? parsed.targetLanguage : "",
      // Defensive against an older draft saved before these two fields
      // existed — Array.isArray keeps it from crashing on that, rather
      // than assuming every stored draft already has the current shape.
      markedIndices: Array.isArray(parsed.markedIndices)
        ? parsed.markedIndices.filter((n: unknown) => typeof n === "number")
        : [],
      translations: Array.isArray(parsed.translations)
        ? parsed.translations.filter(
            (pair: unknown): pair is [string, string] =>
              Array.isArray(pair) &&
              pair.length === 2 &&
              typeof pair[0] === "string" &&
              typeof pair[1] === "string",
          )
        : [],
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

// Also how "clearing" works — Clear writes an empty text back through the
// same effect that keeps this in sync, so there's no separate remove
// function needed; the stored draft just becomes the empty draft.
export function writeInlineTranslateDraft(draft: InlineTranslateDraft) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}
