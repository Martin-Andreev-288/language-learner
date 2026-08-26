// The exact text Next.js substitutes for a server-side error message in
// production builds. Matching on it is admittedly matching on a framework
// string, but the alternative is showing the user a paragraph about
// "Server Components render" and digests, which means nothing to them.
const REDACTED_MARKER = "omitted in production";

// Turns whatever a still-throwing server action threw into something worth
// showing. In development that's the real message; in production, where the
// real message has been redacted away, it's the caller's own fallback
// instead of the framework's internal text (Question 271).
//
// Actions that have a specific, unpreventable message worth keeping —
// the AI ones, where quota and overload need to be actionable — return
// their failures instead of throwing, so they never reach this at all.
// See lib/action-result.ts.
export function describeClientError(err: unknown, fallback: string): string {
    if (!(err instanceof Error)) return fallback;
    const message = err.message?.trim();
    if (!message) return fallback;
    if (message.includes(REDACTED_MARKER)) return fallback;
    return message;
}
