"use client";

import { useState } from "react";
import { sendFeedback } from "@/app/actions/feedback-actions";
import { describeClientError } from "@/lib/client-error";
import {
  FEEDBACK_EMAIL_MAX_CHARACTERS,
  FEEDBACK_MESSAGE_MAX_CHARACTERS,
  FEEDBACK_NAME_MAX_CHARACTERS,
} from "@/lib/limits";

// The contact form (Questions 394-398).
//
// Light theme, unlike every other form in this app — the practice tools are
// dark because they are worked in for long stretches, and this page belongs
// with the home page and the section pages instead, which is where someone
// arrives from.

// One definition of a field's look rather than the same forty characters of
// class list pasted three times (Question 397). The focus treatment is the
// part that matters most: a ring rather than only a colour change, because
// a 1px border going from grey to indigo is a small signal for "this is
// where your typing goes".
const FIELD_CLASSES =
  "w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-[#2c3e50] placeholder-gray-400 outline-none transition-shadow focus:border-[#667eea] focus:ring-4 focus:ring-[#667eea]/15";

const LABEL_CLASSES = "block text-sm font-semibold text-[#2c3e50]";
const OPTIONAL_CLASSES = "font-normal text-gray-400";

export default function FeedbackForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // The honeypot's value. Held in state like the rest so React owns the
  // field, but never shown and never read by anyone typing.
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // Whether the message that just went actually carried an address
  // (Question 398).
  //
  // Recorded at the moment of sending rather than read off the email field
  // afterwards, because the field is not a record of what was sent — it is
  // the current contents of an input, and the handler empties it. The
  // success panel used to ask `email ? …`, by which time the answer was
  // always "no". Asking the right question is the fix; keeping the field
  // populated would also have hidden it, and would have broken again the
  // next time anyone cleared that input.
  const [sentWithEmail, setSentWithEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setError(null);
    try {
      const result = await sendFeedback({ name, email, message, website });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSentWithEmail(Boolean(email.trim()));
      setSent(true);
      // Only the message is cleared. Name and email are who you are, not
      // what you said, and retyping them to report a second thing thirty
      // seconds later is a small, avoidable annoyance.
      setMessage("");
    } catch (err) {
      setError(describeClientError(err, "That didn't send — please try again."));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
          ✓
        </div>
        <p className="text-lg font-semibold text-emerald-900">
          Thank you — that sent.
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-emerald-800">
          {sentWithEmail
            ? "You'll get a reply to the address you left."
            : "You didn't leave an address, so there's no way to reply — but the message did arrive."}
        </p>
        {/* Deliberately offered rather than the form simply vanishing: the
            most likely reason to be on this page twice is remembering a
            second thing thirty seconds later. */}
        <button
          onClick={() => setSent(false)}
          className="mt-5 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-50"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="feedback-name" className={LABEL_CLASSES}>
            Name <span className={OPTIONAL_CLASSES}>(optional)</span>
          </label>
          <input
            id="feedback-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={FEEDBACK_NAME_MAX_CHARACTERS}
            placeholder="What should I call you?"
            className={`mt-1.5 ${FIELD_CLASSES}`}
          />
        </div>

        <div>
          <label htmlFor="feedback-email" className={LABEL_CLASSES}>
            Email <span className={OPTIONAL_CLASSES}>(optional)</span>
          </label>
          <input
            id="feedback-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={FEEDBACK_EMAIL_MAX_CHARACTERS}
            placeholder="Only so a reply can reach you"
            className={`mt-1.5 ${FIELD_CLASSES}`}
          />
        </div>
      </div>

      {/* The honeypot. Hidden from sight and from the keyboard, and told to
          browsers it is not something to autofill — all three matter: a
          field a person could tab into and fill by accident would silently
          discard their message. aria-hidden keeps it away from screen
          readers for exactly the same reason. */}
      <div aria-hidden className="hidden">
        <label htmlFor="feedback-website">Website</label>
        <input
          id="feedback-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="feedback-message" className={LABEL_CLASSES}>
            Message
          </label>
          {/* Only once there is something to count (Question 397). "0 / 4000"
              on an untouched form is a limit announced to someone who has
              not come close to it, and it reads as a warning rather than as
              the reassurance it turns into later. Amber near the ceiling,
              where it becomes information worth having. */}
          {message.length > 0 && (
            <span
              className={`text-xs tabular-nums ${
                message.length > FEEDBACK_MESSAGE_MAX_CHARACTERS * 0.9
                  ? "font-medium text-amber-600"
                  : "text-gray-400"
              }`}
            >
              {message.length} / {FEEDBACK_MESSAGE_MAX_CHARACTERS}
            </span>
          )}
        </div>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={FEEDBACK_MESSAGE_MAX_CHARACTERS}
          rows={6}
          placeholder="A bug, an idea, a language that isn't working properly, anything at all…"
          className={`mt-1.5 resize-y leading-relaxed ${FIELD_CLASSES}`}
        />
      </div>

      {/* An alert rather than a bare red sentence, so a failure is as
          visible as the button that caused it. */}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="w-full rounded-lg bg-linear-to-br from-[#667eea] to-[#764ba2] px-6 py-3 font-semibold text-white shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:hover:translate-y-0"
        >
          {sending ? "Sending…" : "Send message"}
        </button>
        {/* Moved below the button and shrunk (Question 397). It used to be
            three lines of grey text above the fields — the first thing read
            and the least important thing on the page. It is reassurance, and
            reassurance belongs next to the moment it is needed. */}
        <p className="mt-3 text-center text-xs text-gray-500">
          No account needed. Leave the email box empty if you&apos;d rather
          not be replied to.
        </p>
      </div>
    </form>
  );
}
