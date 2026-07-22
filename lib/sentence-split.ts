/**
 * Split text into sentences following these rules:
 *
 * Rule 1: dot + space + lowercase → NO split (e.g., "12. януари" stays together)
 * Rule 2: number + dot + space + any word → NO split (e.g., "7. Buch", "12. Januar" stay together)
 * Rule 3: letter + dot + uppercase (no space) → YES split (e.g., "First.Second" → two sentences)
 * Rule 4: " г." Bulgarian year abbreviation → NO split (e.g., "2016 г. Андерсън" stays together)
 *
 * Abbreviations are NOT handled — the caller is expected to ensure only
 * sentence-ending punctuation remains in the pasted text.
 *
 * @param text - The text to split into sentences
 * @returns Array of sentences
 */
export function splitIntoSentences(text: string): string[] {
    if (!text || !text.trim()) return [];

    let processedText = text;
    const placeholderMap: Map<string, string> = new Map();
    let placeholderCounter = 0;

    const createPlaceholder = (original: string): string => {
        const placeholder = `<<<PROT${placeholderCounter}>>>`;
        placeholderMap.set(placeholder, original);
        placeholderCounter++;
        return placeholder;
    };

    // Step 1: Protect Bulgarian year abbreviation " г."
    processedText = processedText.replace(/ г\./g, (match) => createPlaceholder(match));

    // Step 1b: Force a split after "USA." / "usa."
    processedText = processedText.replace(/\b(USA|usa)\.\s+/gi, (match) => {
        return match.replace(/\.\s+/, ".<<<USASPLIT>>>");
    });

    // Step 2: Protect ordinal-style "number. Word" (e.g. "7. Buch", "6. Stock")
    // [^\S\n]+ matches spaces but not newlines, so a paragraph break after a
    // number (e.g. "2001.\nВъвеждане") is NOT protected.
    const ordinalPattern = /(\d+\.)[^\S\n]+([A-Za-zÄÖÜäöüßА-Яа-яЁё]+)/g;
    processedText = processedText.replace(ordinalPattern, (match) => createPlaceholder(match));

    // Step 3: letter.UppercaseLetter (no space) → force a split
    const SPLIT_MARKER = "<<<SPLIT>>>";
    processedText = processedText.replace(
        /([a-zA-Zа-яА-ЯёЁ])\.([A-ZА-ЯЁ])/g,
        `$1.${SPLIT_MARKER}$2`,
    );

    // Step 4: main split — punctuation + space + uppercase, the split marker, or newlines.
    const upperCasePattern = "[A-ZА-ЯЁÀ-ÖØ-Þ0-9]";
    const quotePattern = "[„\"'«»‹›]";

    const sentences = processedText
        .split(
            new RegExp(
                `(?<=[.!?]${quotePattern}?)\\s+(?=${quotePattern}?${upperCasePattern})|${SPLIT_MARKER}|<<<USASPLIT>>>|\\n+`,
            ),
        )
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    // Step 5: restore protected placeholders
    const restoredSentences = sentences.map((sentence) => {
        let restored = sentence;
        placeholderMap.forEach((original, placeholder) => {
            restored = restored.replace(
                new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
                original,
            );
        });
        return restored;
    });

    return restoredSentences;
}
