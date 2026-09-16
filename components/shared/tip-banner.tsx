"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { pickTip } from "@/lib/learning-tips";

// The strip of advice above the header (Question 387).
//
// A client component, and that is the one real decision in this file.
//
// The obvious build is a server component calling pickTip() — layouts are
// server-rendered, Math.random runs per request, done. It does not work,
// for a reason that only shows up once it is running: App Router *keeps* a
// shared layout across client-side navigation. Moving from Reading to
// Writing re-renders the page underneath and leaves this layout untouched,
// so the tip would sit there unchanged through a whole session and only
// move on a hard refresh — the opposite of the intent, and invisible in
// development unless you happen to click rather than reload.
//
// So the server picks the first one (below, as a prop) and the client picks
// every one after it, on pathname change. Splitting it that way is also
// what avoids a hydration mismatch: if the client picked the first one too,
// server and client would render different text for the same markup.
export default function TipBanner({ initialTip }: { initialTip: string }) {
  const pathname = usePathname();
  // The route this tip was chosen for, stored beside it. React's documented
  // way to adjust state when something changes, and deliberately not an
  // effect: setting state from inside an effect renders once with the old
  // tip, commits it, then renders again with the new one — a visible swap a
  // frame after the page appears. Updating during render, React throws the
  // first result away before the browser ever sees it.
  const [shown, setShown] = useState({ tip: initialTip, pathname });

  if (shown.pathname !== pathname) {
    setShown({ tip: pickTip(shown.tip), pathname });
  }

  const tip = shown.tip;

  return (
    <div className="bg-gray-900 text-gray-300">
      {/* Centred and width-capped rather than edge-to-edge: a single line
          of text running the full width of a desktop monitor is genuinely
          hard to read, and this is meant to be caught in passing. */}
      <p className="mx-auto max-w-4xl px-4 py-2 text-center text-xs leading-relaxed sm:text-sm">
        <span aria-hidden className="mr-1.5">
          💡
        </span>
        {tip}
      </p>
    </div>
  );
}
