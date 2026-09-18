import type { Metadata } from "next";
import FeedbackForm from "@/components/shared/feedback-form";

// The contact page (Questions 394-397).
//
// Only the form. An earlier version of this page also explained what the
// app is, how the AI parts work and what it stores — removed in Question
// 395, and the reason is worth keeping: a link in the header saying
// "Contact" sets an expectation, and a page of instructions underneath it
// answers a question nobody clicking that word was asking. If that writing
// comes back it belongs somewhere its own label promises it.
//
// No address appears anywhere on it either (Question 396). The form is the
// whole channel. Note that this file no longer imports the recipient at
// all — the address exists only where the mail is actually sent, which is
// the arrangement that makes leaking it take real effort rather than a
// moment's inattention.
//
// No auth check anywhere on this route, unlike every other page under this
// layout. That is the point — the person most likely to need a contact page
// is the one who can't get in.

export const metadata: Metadata = {
  title: "Contact",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-8 sm:py-16">
      {/* The heading lives inside the card now (Question 397).

          Question 396 tried to win this with a darker colour and a drop
          shadow, and it half-worked — which was the clue. The layout's
          background is a detailed illustration: a globe, screens, lettering,
          with light and dark patches of its own. Text laid over that is
          legible in some places and not in others depending on where the
          line happens to fall, and no amount of shadow fixes a problem whose
          cause is that there is a picture behind the words.

          So the answer is not to put words on the picture. The card was
          already the one calm surface on this page; everything that has to
          be read now sits on it. */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/5">
        {/* A gradient band across the top, in the same indigo-to-violet the
            primary buttons and the Reading section already use. It gives the
            card an edge against a busy background without needing a border
            heavy enough to look boxed in. */}
        <div className="h-1.5 bg-linear-to-r from-[#667eea] to-[#764ba2]" />

        <div className="p-6 sm:p-10">
          <div className="flex items-start gap-4">
            {/* The same gradient tile the home page and the section pages
                use for their icons, so this page reads as part of the app
                rather than a form bolted onto the side of it. */}
            <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#667eea] to-[#764ba2] text-2xl shadow-md">
              ✉️
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#2c3e50]">
                Contact
              </h1>
              <p className="mt-1.5 text-[#5a6c7d]">
                Found a bug, or something that could work better? Send it
                here.
              </p>
            </div>
          </div>

          <div className="mt-8">
            <FeedbackForm />
          </div>
        </div>
      </div>
    </div>
  );
}
