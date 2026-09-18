"use server";

import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { APP_NAME, FEEDBACK_RECIPIENT_EMAIL } from "@/lib/constants";
import {
    FEEDBACK_EMAIL_MAX_CHARACTERS,
    FEEDBACK_MESSAGE_MAX_CHARACTERS,
    FEEDBACK_NAME_MAX_CHARACTERS,
} from "@/lib/limits";

// Sends what the contact form collected to the app author's inbox
// (Question 394).
//
// Deliberately no `auth()` call, and this is the only action in the app
// that omits one: a contact page that requires an account cannot be used by
// the person most likely to need it — someone who can't get in.
//
// It is also the only action here that *stores* nothing. Question 392
// settled that: the message goes to an inbox and the app keeps no copy, so
// there is no table, and no admin screen to read submissions in — which is
// a screen this app has nowhere else, and would have had to grow just to
// make a stored version useful.

interface FeedbackInput {
    name: string;
    email: string;
    message: string;
    // The honeypot — see below. Named for what it pretends to be, not for
    // what it is, since the name is the part a bot reads.
    website: string;
}

// Enough to catch "not an address at all" and nothing more. Deliberately
// not one of the sprawling RFC-shaped patterns: those reject real,
// deliverable addresses often enough to be a worse bug than the one they
// prevent, and the field is optional anyway.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendFeedback(
    input: FeedbackInput,
): Promise<ActionResult<null>> {
    const name = input.name.trim();
    const email = input.email.trim();
    const message = input.message.trim();

    // The honeypot: a field hidden from people and visible to anything that
    // fills a form by reading its HTML. Anything in it means "not a human",
    // and the answer is a cheerful success rather than a rejection — a bot
    // told it failed tries again with different input, while one told it
    // succeeded has no reason to.
    if (input.website.trim()) {
        return actionOk(null);
    }

    if (!message) {
        return actionError("Please write a message before sending.");
    }
    if (message.length > FEEDBACK_MESSAGE_MAX_CHARACTERS) {
        return actionError(
            `That message is ${message.length} characters — please keep it under ${FEEDBACK_MESSAGE_MAX_CHARACTERS}.`,
        );
    }
    if (name.length > FEEDBACK_NAME_MAX_CHARACTERS) {
        return actionError(
            `That name is ${name.length} characters — please keep it under ${FEEDBACK_NAME_MAX_CHARACTERS}.`,
        );
    }
    if (email.length > FEEDBACK_EMAIL_MAX_CHARACTERS) {
        return actionError("That email address is too long.");
    }
    if (email && !LOOKS_LIKE_EMAIL.test(email)) {
        return actionError(
            "That doesn't look like an email address. Leave it blank if you'd rather not be replied to.",
        );
    }

    const bccEmail = process.env.CONTACT_BCC_EMAIL?.trim();
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        // Says plainly that the app is misconfigured rather than blaming
        // the sender or, worse, reporting a success that never happened.
        console.error("sendFeedback: RESEND_API_KEY is not set.");
        return actionError(
            "Sending isn't working at the moment — that's a fault at this end, not anything you did. Please try again later.",
        );
    }

    // The provider's REST API directly rather than its SDK. One POST does
    // not justify a dependency, a lockfile entry and a package to keep
    // updated — and switching provider later is then a change to this one
    // fetch rather than an uninstall.
    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                // Resend's shared sender, usable without owning a domain.
                // Overridable for when a domain is verified.
                from:
                    process.env.CONTACT_FROM_EMAIL ??
                    `${APP_NAME} <onboarding@resend.dev>`,
                to: [FEEDBACK_RECIPIENT_EMAIL],
                // A second, private recipient (Question 395), so a message
                // can be seen the moment it arrives without waiting on the
                // app's own inbox being checked.
                //
                // An environment variable and not a constant, which is the
                // whole point of it: this address is meant to stay private,
                // and a constant would sit in the source where anyone with
                // the repository could read it. The page never renders it
                // either, and since Question 396 neither does the page.
                //
                // bcc rather than a second entry in `to`: forwarding one of
                // these mails on would otherwise carry the private address
                // in its visible headers.
                ...(bccEmail ? { bcc: [bccEmail] } : {}),
                subject: `${APP_NAME} feedback${name ? ` from ${name}` : ""}`,
                // reply_to, so answering the mail answers the person rather
                // than the robot that relayed it.
                ...(email ? { reply_to: email } : {}),
                text: [
                    `Name:  ${name || "(not given)"}`,
                    `Email: ${email || "(not given)"}`,
                    "",
                    message,
                ].join("\n"),
            }),
        });

        if (!response.ok) {
            // The provider's own message is for whoever owns the API key,
            // not for the visitor — it can name the account and the reason
            // a key was rejected. Logged, not returned.
            console.error(
                "sendFeedback: provider rejected the send",
                response.status,
                await response.text().catch(() => ""),
            );
            return actionError(
                "That didn't send — please try again in a moment.",
            );
        }
    } catch (err) {
        console.error("sendFeedback failed:", err);
        return actionError("That didn't send — please try again in a moment.");
    }

    return actionOk(null);
}
