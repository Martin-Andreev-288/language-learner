// Which columns the vocabulary table shows, and in what order (Question 322).
//
// One list rather than two settings, because hiding and reordering are the
// same fact seen twice: an ordered list of columns, each either shown or
// not. Building the state once gives both behaviours, which is why they
// arrived together rather than as two steps.
//
// Kept in localStorage rather than on the account, unlike the default
// translate-into language. That one is closer to a fact about the person
// and should follow them to another browser; how many columns fit
// comfortably is a fact about the screen you're sitting at, and wanting
// fewer of them on a laptop than on a monitor is reasonable rather than
// something to sync.

const STORAGE_KEY = "vocabulary-table:columns";

// Word and the selection checkbox are deliberately absent: they're what
// makes a row identifiable and selectable, and a table where you can hide
// the word itself is a table of anonymous rows.
export const CONFIGURABLE_COLUMNS = [
    "translation",
    // Beside the single translation it sits next to rather than at the far
    // end, so the two readings of the same idea are compared side by side
    // (Question 327). A layout saved before this column existed picks it up
    // automatically — that's what reconcile() below is for, and this is the
    // first column to actually need it.
    "translations",
    "language",
    "level",
    "nounInfo",
    "partOfSpeech",
    "usedIn",
    "category",
    "wordFamily",
    "synonyms",
    "aiExamples",
    "collocations",
    "ownExample",
    "added",
] as const;

export type ConfigurableColumn = (typeof CONFIGURABLE_COLUMNS)[number];

export interface ColumnSetting {
    key: ConfigurableColumn;
    visible: boolean;
}

// A stable reference, and it has to be: useSyncExternalStore compares
// snapshots by identity, so rebuilding this array on every read would spin
// forever.
export const DEFAULT_COLUMN_LAYOUT: ColumnSetting[] = CONFIGURABLE_COLUMNS.map(
    (key) => ({ key, visible: true }),
);

// Reconciles whatever was stored against the columns that exist now.
//
// This is the part worth having rather than trusting a stored array: a
// layout saved before a column existed would otherwise hide it forever —
// not by choice, just by having been written down before it was invented.
// Known keys keep their stored order and visibility, anything new is
// appended and shown, anything no longer recognised is dropped.
function reconcile(stored: unknown): ColumnSetting[] {
    if (!Array.isArray(stored)) return DEFAULT_COLUMN_LAYOUT;

    const known = new Set<string>(CONFIGURABLE_COLUMNS);
    const seen = new Set<string>();
    const layout: ColumnSetting[] = [];

    for (const item of stored) {
        const key = (item as ColumnSetting)?.key;
        if (typeof key !== "string" || !known.has(key) || seen.has(key)) {
            continue;
        }
        seen.add(key);
        layout.push({
            key: key as ConfigurableColumn,
            visible: (item as ColumnSetting).visible !== false,
        });
    }

    for (const key of CONFIGURABLE_COLUMNS) {
        if (!seen.has(key)) layout.push({ key, visible: true });
    }

    return layout;
}

// Cached because useSyncExternalStore demands a stable snapshot: parsing
// JSON on every call would hand React a new array each time and it would
// re-render endlessly looking for the value to settle.
let cached: ColumnSetting[] | null = null;
const listeners = new Set<() => void>();

export function readColumnLayout(): ColumnSetting[] {
    if (cached) return cached;
    if (typeof window === "undefined") return DEFAULT_COLUMN_LAYOUT;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        cached = raw ? reconcile(JSON.parse(raw)) : DEFAULT_COLUMN_LAYOUT;
    } catch {
        // Unreadable or unavailable storage means the default layout, which
        // is a perfectly usable table — never a reason to fail to render.
        cached = DEFAULT_COLUMN_LAYOUT;
    }
    return cached;
}

// The server has no localStorage, so it renders the default order and the
// stored one takes over once the page is running. On a customised layout
// that means a brief moment of the default arrangement — the price of
// keeping this in the browser rather than on the account.
export function readDefaultColumnLayout(): ColumnSetting[] {
    return DEFAULT_COLUMN_LAYOUT;
}

export function subscribeToColumnLayout(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function writeColumnLayout(layout: ColumnSetting[]) {
    cached = layout;
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
        } catch {
            // Private browsing, or a full quota. The layout still applies
            // for this session; it just won't be remembered.
        }
    }
    for (const listener of listeners) listener();
}

export function moveColumn(
    layout: ColumnSetting[],
    index: number,
    direction: -1 | 1,
): ColumnSetting[] {
    const target = index + direction;
    if (target < 0 || target >= layout.length) return layout;
    const next = [...layout];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

export function toggleColumn(
    layout: ColumnSetting[],
    key: ConfigurableColumn,
): ColumnSetting[] {
    return layout.map((column) =>
        column.key === key ? { ...column, visible: !column.visible } : column,
    );
}
