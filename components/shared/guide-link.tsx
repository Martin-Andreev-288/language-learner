"use client";

import { lazy, Suspense, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { guideTitle } from "@/lib/guides";

// Loaded the first time a guide is opened, with the guides' text and the
// Markdown that draws it.
const GuideWindow = lazy(() => import("@/components/shared/guide-window"));

// The small `? Guide` pill under the header that opens this page's guide
// (Question 52, chapter C), where the pill naming its how-to video used to
// be.
//
// In the layout, once, rather than beside each tool's own description:
// every tool draws its own heading, so that placement would mean the same
// few lines in eleven files and one more for every tool added later. Here
// it is in the same spot on every page — the top right, under the account
// button — so it is found on the second page without looking.
//
// It floats rather than taking a row of its own. A full-width bar for one
// short button costs every page its height and reads as more chrome than it
// is. Floating is safe because of where it lands: every tool page opens
// with py-10 of empty space, and the home page and the sign-in prompts with
// more, so a pill sitting in the top 8–32px of that covers nothing.
//
// A client component because it needs the address, the same reason as the
// tip strip above the header.
export default function GuideLink() {
  const pathname = usePathname();
  const title = guideTitle(pathname);
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);

  if (!title) return null;

  // Every way the window closes ends here, once it is no longer in the way
  // of the page — so focus goes back to where you were.
  function handleClose() {
    setOpen(false);
    pillRef.current?.focus();
  }

  return (
    // No height of its own: the page below starts exactly where it did
    // before. Same width and side padding as the header row, so the pill's
    // right edge lines up with the account button above it.
    <div className="relative mx-auto w-full max-w-7xl">
      {/* z-10 puts it over the page but under the header's menus (z-50),
          which open downwards across this same corner. The window itself
          is above everything, as an open dialog always is. */}
      <div className="absolute right-4 top-2 z-10">
        {/* Its own dark background rather than bare text, because it has
            to read over two very different pages: the near-black tools and
            the light illustrated home page. */}
        <button
          ref={pillRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          title={`How to use ${title}`}
          className="inline-block whitespace-nowrap rounded-full bg-gray-800/90 px-3 py-1 text-xs text-gray-200 shadow-md ring-1 ring-white/10 transition-colors hover:bg-gray-700 hover:text-white"
        >
          <span aria-hidden className="mr-1.5 font-bold">
            ?
          </span>
          Guide
        </button>
      </div>
      {open && (
        <Suspense fallback={null}>
          <GuideWindow title={title} onClose={handleClose} />
        </Suspense>
      )}
    </div>
  );
}
