// Keeps Parallel Translate's columns and its last aligned result alive
// across a page navigation, the same way lib/inline-translate-draft.ts does
// for Inline Translate: sessionStorage, so it lasts as long as the browser
// tab and is gone once the tab closes — "for a while, not necessarily
// forever". Nothing leaves the browser.
//
// The result is stored as it was on screen (its rows, column names and
// text), not re-aligned from the columns on the way back: if you edited a
// column after aligning, the table you come back to is still the one you
// left, exactly as it would have been had you never navigated away.
const STORAGE_KEY = "parallel-translate:draft";

export interface ParallelTranslateDraft {
    columns: { name: string; text: string; collapsed: boolean }[];
    outputFormat: "markdown" | "vertical";
    result: { text: string; rows: string[][]; names: string[] } | null;
}

const isString = (value: unknown): value is string => typeof value === "string";

// Null when there is nothing worth restoring — no draft, an unreadable one,
// or one whose columns are all empty (which is what Clear leaves behind), so
// the page then opens exactly as it does for a first visit, with your
// default language in the first column.
export function readParallelTranslateDraft(): ParallelTranslateDraft | null {
    if (typeof window === "undefined") return null;
    let raw: string | null = null;
    try {
        raw = window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.columns)) return null;

        const columns = parsed.columns
            .filter(
                (column: unknown) =>
                    isString((column as { name?: unknown })?.name) &&
                    isString((column as { text?: unknown })?.text),
            )
            .map((column: { name: string; text: string; collapsed?: unknown }) => ({
                name: column.name,
                text: column.text,
                collapsed: column.collapsed === true,
            }));
        if (columns.length === 0) return null;

        const result = parsed.result;
        const validResult =
            result &&
            isString(result.text) &&
            Array.isArray(result.names) &&
            result.names.every(isString) &&
            Array.isArray(result.rows) &&
            result.rows.every(
                (row: unknown) => Array.isArray(row) && row.every(isString),
            );

        const draft: ParallelTranslateDraft = {
            columns,
            outputFormat: parsed.outputFormat === "vertical" ? "vertical" : "markdown",
            result: validResult
                ? { text: result.text, rows: result.rows, names: result.names }
                : null,
        };

        const isEmpty =
            draft.result === null && draft.columns.every((column) => !column.text.trim());
        return isEmpty ? null : draft;
    } catch {
        return null;
    }
}

export function writeParallelTranslateDraft(draft: ParallelTranslateDraft) {
    if (typeof window === "undefined") return;
    // A few long passages in several languages can approach the per-tab
    // storage limit. Exceeding it throws, and a throw here would break the
    // page mid-typing — so a full store just means this one change isn't
    // kept, which costs nothing you had a moment ago.
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
        // Not kept; the page itself carries on unaffected.
    }
}
