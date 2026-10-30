"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { GUIDE_TEXTS } from "@/lib/guide-texts";
import { guideGroups } from "@/lib/guides";

// The window a page's guide opens in (Question 52, chapter C): over the
// page rather than on a page of its own, so nothing you've typed is left
// behind to read it. It opens on this page's guide, and "All guides" lists
// every other one, grouped like the header menu — reading another page's
// guide doesn't mean leaving this one.
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

// Each line of a guide is short Markdown — bold for a button's name, code
// for what you'd type — and sits inside a list item or a paragraph
// already, so it adds no paragraph.
const INLINE = {
  p: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-zinc-100">{children}</strong>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-xs text-zinc-200">{children}</code>
  ),
};

function Line({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={INLINE}
      allowedElements={["p", "strong", "em", "code"]}
      unwrapDisallowed
    >
      {text}
    </ReactMarkdown>
  );
}

// What the window is showing: a guide, by its title, or the list of all.
const ALL = null;

export default function GuideWindow({ title, onClose }: { title: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [shown, setShown] = useState<string | typeof ALL>(title);
  const [moved, setMoved] = useState(false);
  const guide = shown === ALL ? undefined : GUIDE_TEXTS[shown];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // After moving between a guide and the list: back to the top, and focus
  // on the new heading, so a screen reader says where you are now. Not on
  // opening, where the browser has already put focus in the window.
  useEffect(() => {
    if (!moved) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    headingRef.current?.focus();
  }, [shown, moved]);

  const close = () => dialogRef.current?.close();
  const show = (next: string | typeof ALL) => {
    setShown(next);
    setMoved(true);
  };

  const linkButton =
    "text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200";

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
      <div ref={bodyRef} className="max-h-[85vh] overflow-y-auto p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Guide</p>
            <h2
              id="guide-window-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold text-zinc-100 outline-none"
            >
              {shown === ALL ? "All guides" : shown}
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

        {shown === ALL ? (
          <nav aria-label="All guides" className="space-y-4">
            {guideGroups().map((group) => (
              <section key={group.label}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {group.label}
                </h3>
                <ul className="space-y-1">
                  {group.titles.map((item) => (
                    <li key={item}>
                      <button type="button" onClick={() => show(item)} className={linkButton}>
                        {item}
                      </button>
                      {item === title && (
                        <span className="ml-2 text-xs text-zinc-500">this page</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        ) : guide ? (
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

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
          {shown === ALL ? (
            <button type="button" onClick={() => show(title)} className={linkButton}>
              ← Back to {title}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => show(ALL)} className={linkButton}>
                All guides
              </button>
              {shown !== title && (
                <button type="button" onClick={() => show(title)} className={linkButton}>
                  ← Back to {title}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
