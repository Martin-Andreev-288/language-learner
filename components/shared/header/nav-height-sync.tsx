"use client";

import { useEffect } from "react";

// Keeps --nav-height equal to the navbar's real height (Question 454 in
// video directions.md).
//
// The navbar is sticky, so the two other things in the app that stick to
// the top of the screen — the Play/Pause bars in Parallel Listen and Inline
// Listen — have to stick just below it, not at 0, or they slide underneath
// and disappear. Its height is not one number: the title wraps onto two
// lines on a narrow phone, and the phone menu opens inside it. A CSS value
// alone can't follow either, so this measures the element itself and
// re-measures whenever it changes size.
export default function NavHeightSync() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-site-nav]");
    if (!header) return;

    const root = document.documentElement;
    // Zero when the header isn't sticky (a short screen — see the header),
    // because then nothing is covering the top and the bars should go
    // right up to it.
    const update = () => {
      const sticky = getComputedStyle(header).position === "sticky";
      root.style.setProperty(
        "--nav-height",
        `${sticky ? header.offsetHeight : 0}px`,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    // Turning a phone changes whether the header is sticky without
    // necessarily changing its size, which the observer alone would miss.
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      // Back to the default in globals.css rather than a stale measurement.
      root.style.removeProperty("--nav-height");
    };
  }, []);

  return null;
}
