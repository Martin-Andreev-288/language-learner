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

// One phrase and everything it was translated into.
export type DraftTranslation = [string, { language: string; text: string }[]];

export interface InlineTranslateDraft {
  text: string;
  sourceLanguage: string;
  // A list since Question 339. The single `targetLanguage` a draft used to
  // carry is still read, and still meaningful — see readInlineTranslateDraft.
  targetLanguages: string[];
  markedIndices: number[];
  translations: DraftTranslation[];
}

export const EMPTY_DRAFT: InlineTranslateDraft = {
  text: "",
  sourceLanguage: "",
  targetLanguages: [],
  markedIndices: [],
  translations: [],
};

export function readInlineTranslateDraft(): InlineTranslateDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY_DRAFT;
  try {
    const parsed = JSON.parse(raw);

    // A draft written before Question 339 has one language and translations
    // as plain [phrase, text] pairs. Both are still readable, and the old
    // language is what makes them so: it says which language those plain
    // strings were in, so they can be lifted into the new shape rather than
    // thrown away. Without it they would be text with no language — the
    // exact problem Question 333 removed from the database.
    const legacyLanguage =
      typeof parsed.targetLanguage === "string" ? parsed.targetLanguage.trim() : "";

    const targetLanguages = Array.isArray(parsed.targetLanguages)
      ? parsed.targetLanguages.filter(
          (name: unknown) => typeof name === "string" && name.trim(),
        )
      : legacyLanguage
        ? [legacyLanguage]
        : [];

    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      sourceLanguage:
        typeof parsed.sourceLanguage === "string" ? parsed.sourceLanguage : "",
      targetLanguages,
      // Defensive against an older draft saved before these two fields
      // existed — Array.isArray keeps it from crashing on that, rather
      // than assuming every stored draft already has the current shape.
      markedIndices: Array.isArray(parsed.markedIndices)
        ? parsed.markedIndices.filter((n: unknown) => typeof n === "number")
        : [],
      translations: Array.isArray(parsed.translations)
        ? parsed.translations.flatMap((pair: unknown): DraftTranslation[] => {
            if (!Array.isArray(pair) || pair.length !== 2) return [];
            const [phrase, value] = pair;
            if (typeof phrase !== "string") return [];

            // The current shape: a list of {language, text}.
            if (Array.isArray(value)) {
              const items = value.filter(
                (item: unknown): item is { language: string; text: string } =>
                  typeof (item as { language?: unknown })?.language === "string" &&
                  typeof (item as { text?: unknown })?.text === "string",
              );
              return items.length > 0 ? [[phrase, items]] : [];
            }

            // The old shape, lifted into the new one using the language the
            // same draft recorded.
            if (typeof value === "string" && legacyLanguage) {
              return [[phrase, [{ language: legacyLanguage, text: value }]]];
            }
            return [];
          })
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
