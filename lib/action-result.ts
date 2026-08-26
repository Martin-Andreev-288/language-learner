// Why actions return failures instead of throwing them (Question 271):
//
// Next.js redacts server-side error messages in production builds — a
// thrown `new Error("That's 3022 characters…")` reaches the browser as a
// generic "An error occurred in the Server Components render. The specific
// message is omitted in production builds…" paragraph. That's deliberate
// and correct for unexpected errors, since it stops internals leaking, but
// it also silently destroys every carefully-worded message meant for the
// user. Locally nothing looks wrong, because dev builds don't redact.
//
// A returned value isn't an error, so nothing redacts it. Expected,
// safe-to-show failures are therefore returned; genuinely unexpected ones
// still throw and still get redacted, which is exactly the behaviour worth
// keeping.
export type ActionResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string };

export function actionOk<T>(data: T): ActionResult<T> {
    return { ok: true, data };
}

export function actionError<T = never>(error: string): ActionResult<T> {
    return { ok: false, error };
}
