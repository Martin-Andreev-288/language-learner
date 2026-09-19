// Turning what the word list is showing into text you can paste
// (Questions 404, 405).
//
// Here rather than inside the component for one reason that matters more
// than tidiness: this is the part with rules in it — which rows, which
// columns, what a cell full of bullet points becomes on one line — and a
// pure function taking data and returning a string can be tested without a
// browser, a clipboard, or a signed-in session. The component keeps the
// clicking; this keeps the deciding.

// Markdown, not tab-separated (Question 405).
//
// Tab-separated pastes into a spreadsheet as columns, which was the reason
// for it, and it reads as noise everywhere else — which is most places, and
// was the complaint. Markdown reads as a table in plain text and renders as
// one wherever markdown is understood.
//
// Including this app: the notes pages run react-markdown with remark-gfm,
// so a table copied here and pasted into a note renders as an actual table
// rather than a wall of pipes. That wasn't the reason for the change, but
// it is the neatest consequence of it.
const COLUMN_SEPARATOR = " | ";
const ROW_SEPARATOR = "\n";

// What a multi-line cell collapses to. A word's Examples column holds two
// or three whole sentences, one per line; pasted as real newlines they
// would break out of the row they belong to. A semicolon keeps them in the
// one cell and still reads as a list.
const VALUE_SEPARATOR = "; ";

// What separates one language's translations from the next, in the list
// view's single line (Question 405) — asked for by name, and it earns the
// place: commas already separate the translations *within* a language, so
// a second comma between languages made one run of words out of three.
const LANGUAGE_SEPARATOR = " / ";

export interface CopyColumn {
    key: string;
    label: string;
}

export interface CopyRow {
    // Keyed by column key. Missing or empty is a blank cell, not a gap in
    // the row — every row has every column so the columns stay aligned.
    values: Record<string, string>;
}

export interface CopyListRow {
    word: string;
    // Gender and plural, when the word has them: the "f, -en" that sits
    // beside the word everywhere else in this app (Question 405).
    nounInfo: string;
    // One entry per language, already tagged — `[en]`, `[fr]`.
    groups: { tag: string; text: string }[];
}

// Flattens one cell's text onto a single line, and disarms the characters
// that would otherwise break the table around it.
//
// Exported because it is the rule most worth testing on its own. All three
// of these are reachable with ordinary input: the fields feeding it are
// free text, typed by a person or written by a model.
export function cellText(value: string): string {
    return (
        value
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join(VALUE_SEPARATOR)
            // A pipe inside a cell ends that cell early and shifts every
            // column after it. Escaped rather than replaced, since a pipe
            // in someone's example sentence is theirs to keep.
            .replace(/\|/g, "\\|")
            // A tab is invisible and would survive into whatever this is
            // pasted into, where it may well mean "next column".
            .replace(/\t/g, " ")
            .trim()
    );
}

// The table view: a markdown table — header, separator, then one row per
// word, in the column order on screen and holding only the columns on
// screen.
export function buildTableCopy(
    columns: CopyColumn[],
    rows: CopyRow[],
): string {
    // COLUMN_SEPARATOR already carries its own pipe, so the ends take
    // only the padding — adding a second one here is how the first version
    // of this produced "| | Word | Level ||".
    const line = (cells: string[]) => `| ${cells.join(COLUMN_SEPARATOR)} |`;

    const header = line(columns.map((column) => cellText(column.label)));
    // Three dashes is the minimum a separator row needs; padding it to the
    // width of the column would make the raw text prettier and every line
    // hundreds of characters long once Examples is showing.
    const divider = line(columns.map(() => "---"));
    const body = rows.map((row) =>
        line(columns.map((column) => cellText(row.values[column.key] ?? ""))),
    );

    return [header, divider, ...body].join(ROW_SEPARATOR);
}

// The list view, which isn't columns and shouldn't pretend to be
// (Answer 403). One readable line per word.
//
// The word's own language is deliberately absent (Question 405). It was in
// here and it was the least useful thing on the line: you are looking at
// your own vocabulary, so the language a word is saved under is rarely the
// question — what its translations are, and which language each belongs
// to, is.
export function buildListCopy(rows: CopyListRow[]): string {
    return rows
        .map(({ word, nounInfo, groups }) => {
            const parts = [cellText(word)];

            const info = cellText(nounInfo);
            if (info) parts.push(info);

            const rendered = groups
                // Dropped before it is formatted rather than after: a
                // language with a tag and nothing behind it is an empty
                // translation wearing a label, and belongs on the line no
                // more than an empty cell belongs in a table.
                .map(({ tag, text }) => ({ tag, text: cellText(text) }))
                .filter(({ text }) => text.length > 0)
                .map(({ tag, text }) => `${tag} ${text}`)
                .join(LANGUAGE_SEPARATOR);
            if (rendered) parts.push(rendered);

            return parts.join(" ");
        })
        .join(ROW_SEPARATOR);
}
