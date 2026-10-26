import { APICallError, LoadAPIKeyError, RetryError } from "ai";

/**
 * Turns whatever the `ai` SDK threw into a message that's safe and useful to
 * show a user — distinguishing a missing key, a quota limit, a transient
 * overload, and anything else, instead of one generic message for every
 * failure. Always log the original `err` server-side too; this only covers
 * what's shown to the user.
 */
const isTimeout = (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    (value.name === "TimeoutError" || value.name === "AbortError");

export function describeAiError(err: unknown, serviceLabel: string): Error {
    const cause = RetryError.isInstance(err) ? err.lastError : err;

    // Cut short by the caller's own time limit (AbortSignal.timeout): the
    // model never answered, which is a different thing to say from "couldn't
    // reach it", and one the person can act on by trying again.
    if (isTimeout(cause)) {
        return new Error(`The ${serviceLabel.toLowerCase()} took too long to answer — try again.`);
    }

    if (LoadAPIKeyError.isInstance(cause)) {
        return new Error(
            "No Google Generative AI API key found — add GOOGLE_GENERATIVE_AI_API_KEY to .env and restart the dev server (Next.js only reads .env at startup, so a key added while it's already running won't be picked up until it's restarted).",
        );
    }

    if (APICallError.isInstance(cause)) {
        if (cause.statusCode === 429 || /quota/i.test(cause.message)) {
            return new Error(
                "Google's API says this key is over its quota for this model — check the billing/quota page for this key in Google AI Studio.",
            );
        }
        if (cause.statusCode === 503 || /overloaded|high demand/i.test(cause.message)) {
            return new Error(
                "Gemini is temporarily overloaded on Google's side — wait a bit and try again.",
            );
        }
        return new Error(`${serviceLabel} error: ${cause.message}`);
    }

    return new Error(
        `Couldn't reach the ${serviceLabel.toLowerCase()} — check the server console for the underlying error.`,
    );
}
