// The handful of languages most recently picked from a language field,
// shown at the top of the picker the way Bing's translator does
// (Question 232). Deliberately localStorage, not sessionStorage — unlike
// every other stored thing in this app so far (drafts, carries), which
// are all "for this tab, for now," recently-used languages are only
// useful if they survive closing the tab. Worth naming as the first
// localStorage use here rather than letting it pass as more of the same
// pattern.
//
// Stores canonical names exactly as LANGUAGE_NAMES spells them, so a
// stored entry always still resolves to a voice code.
const STORAGE_KEY = "language-picker:recent";
const MAX_RECENT = 5;

export function readRecentLanguages(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((name: unknown): name is string => typeof name === "string")
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

// Most-recent-first, deduplicated, capped. Returns the updated list so a
// caller that just recorded a pick can show it without a second read.
export function recordRecentLanguage(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return readRecentLanguages();

  const next = [
    trimmed,
    ...readRecentLanguages().filter(
      (existing) => existing.toLowerCase() !== trimmed.toLowerCase(),
    ),
  ].slice(0, MAX_RECENT);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private-browsing quota errors and the like — remembering recents
      // is a convenience, never worth breaking a language change over.
    }
  }
  return next;
}
