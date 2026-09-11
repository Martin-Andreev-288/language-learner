import { TITLE_ABBREVIATIONS } from "@/lib/title-abbreviations";

const escapeForRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Longest first, so "Dipl.-Ing." is matched whole rather than having its
// tail taken by "Ing." — and "Sig.ra" by "Sig.". Alternation in JavaScript
// takes the first branch that matches, not the longest, so the ordering is
// doing real work here rather than being tidy.
//
// The lookbehind stops an abbreviation being found inside a longer word:
// without it, "M." would match the tail of "IBM.". \p{L} rather than \b
// because \b is defined on [A-Za-z0-9_] and would treat every Cyrillic
// letter as a boundary — which would break exactly the Bulgarian entries
// this list went to the trouble of including.
// Stands in for the period inside a protected abbreviation while the split
// runs. A Private Use Area character: it can't occur in real text, it isn't
// a letter or a number as far as \p{L}/\p{N} are concerned, and it isn't
// whitespace, so nothing else in this file reacts to it.
const ABBREVIATION_DOT = "\uE000";

const ABBREVIATION_PATTERN = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${[...TITLE_ABBREVIATIONS]
        .sort((a, b) => b.length - a.length)
        .map(escapeForRegExp)
        .join("|")})`,
    "gu",
);

/**
 * Split text into sentences following these rules:
 *
 * Rule 1: dot + space + lowercase → NO split (e.g., "12. януари" stays together)
 * Rule 2: number + dot + space + any word → NO split (e.g., "7. Buch", "12. Januar" stay together)
 * Rule 3: letter + dot + uppercase (no space) → YES split (e.g., "First.Second" → two sentences)
 * Rule 4: " г." Bulgarian year abbreviation → NO split (e.g., "2016 г. Андерсън" stays together)
 *
 * Rule 5: a known abbreviation's period → NO split (e.g. "Dr. Wagner" stays
 * together). The list lives in lib/title-abbreviations.ts; see there for
 * what earns a place on it and what deliberately doesn't (Question 369).
 * Rule 6: a lone initial's period → NO split (e.g. "J. K. Rowling" stays
 * together), at the cost of joining a sentence that really ends in a single
 * capital letter to the one after it (Question 370).
 *
 * @param text - The text to split into sentences
 * @returns Array of sentences
 */
// A lone capital letter carrying a period — the "J." and the "K." of
// "J. K. Rowling", or the "W." of "George W. Bush" (Question 370).
//
// \p{Lu} rather than a hand-written A-Z, so Cyrillic and accented initials
// are covered by the same rule rather than needing their own ranges added
// each time a language turns up. The lookbehind is what keeps it to a
// *lone* letter: without it, the "M." of "IBM." would qualify.
const INITIAL_PATTERN = /(?<![\p{L}\p{N}])\p{Lu}\./gu;

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

    // Step 1a: Hide the period inside a known abbreviation, so it is never
    // offered to the main split (Question 369).
    //
    // Only the period is swapped out — not the whole abbreviation — and
    // that distinction is the entire correctness of this step rather than a
    // detail. Replacing "Mrs." wholesale with a placeholder also hides its
    // capital M, and the main split needs to *see* a capital to recognise
    // the start of a sentence. So "...yesterday. Mrs. Davies called." would
    // stop splitting at the real boundary: the abbreviation that was meant
    // to be protected mid-sentence was silently breaking sentences that
    // genuinely began with one. Leaving "Mrs" visible and taking only the
    // dot keeps both halves right.
    //
    // It also keeps case intact for free, which matters because this list
    // holds lower-case entries too: Italian "il dott. Ferrari" must go on
    // not splitting, and it does, because "dott" still reads as lower case
    // to the lookahead exactly as it did before.
    //
    // Runs before Step 3's letter.Uppercase rule on purpose: "Dr.Wagner"
    // with the space missed out is a typo for one name, not two sentences
    // run together, and hiding the dot first is what keeps that rule's
    // hands off it.
    processedText = processedText.replace(ABBREVIATION_PATTERN, (match) =>
        match.replace(/\./g, ABBREVIATION_DOT),
    );

    // Step 1a-ii: Hide the period after a lone initial, so a name isn't cut
    // in half at it (Question 370).
    //
    // This one carries a cost the abbreviation list doesn't, and it's worth
    // stating plainly rather than burying: a sentence that genuinely ends in
    // a single capital letter — "Das ist Plan B. Wir fangen morgen an." —
    // has exactly the same shape as an initial, and will now be joined to
    // the sentence after it.
    //
    // I looked for a way to tell the two apart and didn't find one worth
    // having. The most promising rule — treat it as an initial only when a
    // capitalised word sits before it — works in English and is useless in
    // German, where every noun is capitalised and so "Plan B." satisfies it
    // just as well as "George W." does. A rule that only works in one of
    // the languages this app is used in is worse than an honest trade.
    //
    // The trade: names with initials are common in ordinary prose, and
    // sentences ending in a bare letter are rare in it. Ordered after the
    // abbreviation list so "Dr. J. Smith" has both handled.
    processedText = processedText.replace(INITIAL_PATTERN, (match) =>
        match.replace(".", ABBREVIATION_DOT),
    );

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
    // Curly quotes included since Question 369, and they were missing
    // rather than excluded: the character list here has always been
    // documented as covering them, and at some point along the way the
    // curly pair was replaced by a second and third copy of the straight
    // one — duplicates in a character class, which change nothing.
    //
    // The effect was a quiet merge rather than a visible break. A closing
    // curly quote sits between the full stop and the space, so the
    // lookbehind below finds ” where it needs [.!?] and gives up — and
    // two sentences become one. Models write curly quotes by default, so
    // this fires on generated dialogue constantly.
    const quotePattern = "[„“”\"‘’'«»‹›]";
    // A sentence may begin with Markdown bold — Inline Listen receives
    // passages where a marked word is written as `**word**`, and without
    // this the `**` sits between the space and the capital letter, the
    // lookahead fails, and that sentence gets swallowed into the previous
    // one. Optional, so plain text splits exactly as it always did.
    const boldPattern = "\\*{0,2}";

    const sentences = processedText
        .split(
            new RegExp(
                `(?<=[.!?]${quotePattern}?)\\s+(?=${boldPattern}${quotePattern}?${upperCasePattern})|${SPLIT_MARKER}|<<<USASPLIT>>>|\\n+`,
            ),
        )
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    // Step 5: restore protected placeholders, and the abbreviation dots
    const restoredSentences = sentences.map((sentence) => {
        let restored = sentence.split(ABBREVIATION_DOT).join(".");
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
