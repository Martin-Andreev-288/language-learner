"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { GUIDE_TEXTS } from "@/lib/guide-texts";

// The window a page's guide opens in (Question 52, chapter C): over the
// page rather than on a page of its own, so nothing you've typed is left
// behind to read it.
//
// The browser's own modal <dialog>, which does what a window like this
// must and the app's other pop-ups don't: focus moves into it, the page
// behind can't be reached with Tab or a screen reader until it closes, and
// Esc closes it. Every way of closing goes through the dialog's own close,
// so the page hears about it in one place — which is where focus is given
// back to the pill (components/shared/guide-link.tsx).
//
// A file of its own, loaded only when a guide is opened: the text and the
// Markdown that draws it are on no page until then.

// Each line of a guide is short Markdown — bold for a button's name — and
// sits inside a list item or a paragraph already, so it adds no paragraph.
const INLINE = {
  p: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-zinc-100">{children}</strong>
  ),
};

function Line({ text }: { text: string }) {
  return (
    <ReactMarkdown components={INLINE} allowedElements={["p", "strong", "em"]} unwrapDisallowed>
      {text}
    </ReactMarkdown>
  );
}

export default function GuideWindow({ title, onClose }: { title: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const guide = GUIDE_TEXTS[title];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="guide-window-title"
      onClose={onClose}
      // A press on the dimmed page around the window lands on the dialog
      // itself; one inside the window lands on what's in it.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 p-0 text-zinc-300 shadow-2xl backdrop:bg-black/60"
    >
      <div className="max-h-[85vh] overflow-y-auto p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Guide</p>
            <h2 id="guide-window-title" className="text-xl font-semibold text-zinc-100">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {guide ? (
          <div className="space-y-5 text-sm leading-relaxed">
            <p className="text-base text-zinc-200">
              <Line text={guide.purpose} />
            </p>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-zinc-100">How to use it</h3>
              <ol className="list-decimal space-y-1.5 pl-5 marker:text-zinc-500">
                {guide.steps.map((step) => (
                  <li key={step}>
                    <Line text={step} />
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-zinc-100">Good to know</h3>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-zinc-600">
                {guide.tips.map((tip) => (
                  <li key={tip}>
                    <Line text={tip} />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : (
          // Only if a page names a guide that hasn't been written, which the
          // test beside lib/guides.ts is there to stop.
          <p className="text-sm text-zinc-500">This guide isn&apos;t written yet.</p>
        )}
      </div>
    </dialog>
  );
}
