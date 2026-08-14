// Keeps Inline Translate's pasted text and language fields alive across a
// page navigation — sessionStorage, not a database: gone once the tab
// closes, which is exactly "for a while, not necessarily forever." Unlike
// parallel-listen-carry.ts, this isn't a one-time, read-and-clear hand-off
// between two pages — it's a draft of the same page, rewritten on every
// change and read back whenever the page is opened again.
//
// Deliberately scoped to just text and the two language fields for this
// iteration — marked words and an existing translation result aren't
// persisted here.
const STORAGE_KEY = "inline-translate:draft";

export interface InlineTranslateDraft {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

const EMPTY_DRAFT: InlineTranslateDraft = {
  text: "",
  sourceLanguage: "",
  targetLanguage: "",
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
