// One-time hand-off from a saved note back into Shadowing — sessionStorage,
// consumed exactly once by the receiving page, the same shape as
// inline-listen-carry.ts.
//
// Carries the passage and its language, and nothing else (Question 360). Not
// the sentence you had reached: "practice again" is a request to practise the
// passage, and dropping someone into the middle of it would be answering a
// question they didn't ask. Not your recordings or the feedback on them
// either — storing audio is a different and much heavier feature than this
// one, and the note is a passage worth keeping rather than a record of one
// session with it.
const STORAGE_KEY = "shadowing:carry";

export interface ShadowingCarry {
  text: string;
  language: string;
}

export function writeShadowingCarry(carry: ShadowingCarry) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(carry));
}

export function readAndClearShadowingCarry(): ShadowingCarry | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  // Cleared on read, which is what makes this a hand-off rather than a
  // draft: reloading the page afterwards leaves you where you are instead
  // of silently restarting the passage you'd just navigated away from.
  window.sessionStorage.removeItem(STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.text !== "string") return null;
    return {
      text: parsed.text,
      language: typeof parsed.language === "string" ? parsed.language : "",
    };
  } catch {
    return null;
  }
}
