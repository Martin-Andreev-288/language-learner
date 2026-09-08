// Which languages enrichment generates in, remembered between batches
// (Questions 331 and 333).
//
// In localStorage rather than on the account, for the same reason the
// table's column layout is: this is a habit of how you're working today —
// a week on translations, a week on the source words — not a fact about
// you that should follow you to another browser. The account default
// translate-into language is the other kind, and it lives on the account.
//
// Read through the same subscribe/read pair the column layout uses, so the
// server renders the plain default and the stored choice takes over on the
// client without a flash and without setState inside an effect.

import type { EnrichmentScope } from "@/lib/vocabulary-enrichment";

const STORAGE_KEY = "vocabulary-enrich:scope";

// "own" is what enrichment did before any of this existed, so it's what an
// unchanged habit produces on a browser that has never chosen.
const DEFAULT_SCOPE: EnrichmentScope = "own";

function isScope(value: unknown): value is EnrichmentScope {
    return value === "own" || value === "translated" || value === "both";
}

let cached: EnrichmentScope | null = null;
const listeners = new Set<() => void>();

export function readEnrichmentScope(): EnrichmentScope {
    if (cached) return cached;
    if (typeof window === "undefined") return DEFAULT_SCOPE;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        cached = isScope(raw) ? raw : DEFAULT_SCOPE;
    } catch {
        // Unreadable storage means the default, which is a perfectly good
        // answer — never a reason to fail to render the modal.
        cached = DEFAULT_SCOPE;
    }
    return cached;
}

export function readDefaultEnrichmentScope(): EnrichmentScope {
    return DEFAULT_SCOPE;
}

export function subscribeToEnrichmentScope(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function writeEnrichmentScope(scope: EnrichmentScope) {
    cached = scope;
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(STORAGE_KEY, scope);
        } catch {
            // Private browsing, or a full quota. The choice still applies
            // to this batch; it just won't be waiting next time.
        }
    }
    for (const listener of listeners) listener();
}
