// Best-effort language name → BCP-47 mapping so speechSynthesis picks a
// matching voice when the browser has one. Names are freeform text a user
// typed, not a fixed list, so this only ever improves the common case
// (someone types "German" or "De") — an unrecognized name simply falls
// back to the browser's default voice rather than blocking playback.
// Shared between Parallel Listen, Inline Listen, and Shadowing Practice,
// the tools that need to turn a language name into a voice hint.
//
// Written as one list of entries rather than a flat alias→code map
// (Question 237) so the same source can produce both the lookup map *and*
// the canonical display names the language picker offers. Deriving the
// picker's list from this means anything picked from it is guaranteed to
// resolve to a voice code — the two can't drift apart the way a separate,
// hand-maintained list of names would.
interface LanguageEntry {
  // Canonical, human-readable name — what the picker shows and what gets
  // written into the field when one is chosen.
  name: string;
  code: string;
  // Other spellings that should still resolve, including endonyms and
  // two-letter codes. Never shown in the picker.
  aliases?: string[];
}

const LANGUAGES: LanguageEntry[] = [
  { name: "Afrikaans", code: "af-ZA", aliases: ["af"] },
  { name: "Albanian", code: "sq-AL", aliases: ["sq"] },
  { name: "Arabic", code: "ar-SA", aliases: ["ar"] },
  { name: "Armenian", code: "hy-AM", aliases: ["hy"] },
  { name: "Basque", code: "eu-ES", aliases: ["eu"] },
  { name: "Bengali", code: "bn-BD", aliases: ["bn"] },
  { name: "Bosnian", code: "bs-BA", aliases: ["bs"] },
  { name: "Bulgarian", code: "bg-BG", aliases: ["bg"] },
  { name: "Catalan", code: "ca-ES", aliases: ["ca"] },
  { name: "Chinese", code: "zh-CN", aliases: ["zh"] },
  { name: "Croatian", code: "hr-HR", aliases: ["hr"] },
  { name: "Czech", code: "cs-CZ", aliases: ["cs"] },
  { name: "Danish", code: "da-DK", aliases: ["da"] },
  { name: "Dutch", code: "nl-NL", aliases: ["nl"] },
  { name: "English", code: "en-US", aliases: ["en"] },
  { name: "Estonian", code: "et-EE", aliases: ["et"] },
  { name: "Filipino", code: "fil-PH", aliases: ["tagalog"] },
  { name: "Finnish", code: "fi-FI", aliases: ["fi"] },
  { name: "French", code: "fr-FR", aliases: ["français", "fr"] },
  { name: "Georgian", code: "ka-GE", aliases: ["ka"] },
  { name: "German", code: "de-DE", aliases: ["deutsch", "de"] },
  { name: "Greek", code: "el-GR", aliases: ["el"] },
  { name: "Hebrew", code: "he-IL", aliases: ["he"] },
  { name: "Hindi", code: "hi-IN", aliases: ["hi"] },
  { name: "Hungarian", code: "hu-HU", aliases: ["hu"] },
  { name: "Icelandic", code: "is-IS" },
  { name: "Indonesian", code: "id-ID", aliases: ["id"] },
  { name: "Irish", code: "ga-IE", aliases: ["ga"] },
  { name: "Italian", code: "it-IT", aliases: ["italiano", "it"] },
  { name: "Japanese", code: "ja-JP", aliases: ["ja"] },
  { name: "Korean", code: "ko-KR", aliases: ["ko"] },
  { name: "Latvian", code: "lv-LV", aliases: ["lv"] },
  { name: "Lithuanian", code: "lt-LT", aliases: ["lt"] },
  { name: "Macedonian", code: "mk-MK", aliases: ["mk"] },
  { name: "Malay", code: "ms-MY", aliases: ["ms"] },
  { name: "Norwegian", code: "nb-NO", aliases: ["no"] },
  { name: "Persian", code: "fa-IR", aliases: ["farsi", "fa"] },
  { name: "Polish", code: "pl-PL", aliases: ["pl"] },
  { name: "Portuguese", code: "pt-PT", aliases: ["pt"] },
  { name: "Portuguese (Brazil)", code: "pt-BR", aliases: ["brazilian"] },
  { name: "Romanian", code: "ro-RO", aliases: ["ro"] },
  { name: "Russian", code: "ru-RU", aliases: ["ru"] },
  { name: "Serbian", code: "sr-RS", aliases: ["sr"] },
  { name: "Slovak", code: "sk-SK", aliases: ["sk"] },
  { name: "Slovenian", code: "sl-SI", aliases: ["sl"] },
  { name: "Spanish", code: "es-ES", aliases: ["español", "es"] },
  { name: "Swahili", code: "sw-KE", aliases: ["sw"] },
  { name: "Swedish", code: "sv-SE", aliases: ["sv"] },
  { name: "Tamil", code: "ta-IN", aliases: ["ta"] },
  { name: "Thai", code: "th-TH", aliases: ["th"] },
  { name: "Turkish", code: "tr-TR", aliases: ["tr"] },
  { name: "Ukrainian", code: "uk-UA", aliases: ["uk"] },
  { name: "Urdu", code: "ur-PK", aliases: ["ur"] },
  { name: "Vietnamese", code: "vi-VN", aliases: ["vi"] },
  { name: "Welsh", code: "cy-GB", aliases: ["cy"] },
];

// Canonical names only, already in the order the picker should show them
// (alphabetical, as the list above is written).
export const LANGUAGE_NAMES: string[] = LANGUAGES.map((entry) => entry.name);

const LANGUAGE_CODES: Record<string, string> = {};
for (const entry of LANGUAGES) {
  LANGUAGE_CODES[entry.name.toLowerCase()] = entry.code;
  for (const alias of entry.aliases ?? []) {
    LANGUAGE_CODES[alias.toLowerCase()] = entry.code;
  }
}

export function guessLanguageCode(name: string): string | undefined {
  return LANGUAGE_CODES[name.trim().toLowerCase()];
}
