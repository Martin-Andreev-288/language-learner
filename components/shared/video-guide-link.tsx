"use client";

import { usePathname } from "next/navigation";
import { VIDEO_PLAYLIST_URL, videoGuideTitle } from "@/lib/video-guides";

// The small pill under the header that names this page's how-to video
// (video directions.md, Answers 10 and 12 from file 'video directions.md').
//
// In the layout, once, rather than beside each tool's own description where
// it was first planned: every tool draws its own heading, so that placement
// meant the same few lines in eleven files and one more for every tool
// added later. Here it is in the same spot on every page — the top right,
// under the account button — which is also what lets a viewer find it on
// the second page without looking.
//
// It floats rather than taking a row of its own. A full-width bar for one
// short link costs every page its height and reads as more chrome than it
// is. Floating is safe because of where it lands: every tool page opens
// with py-10 of empty space, and the home page and the sign-in prompts with
// more, so a pill sitting in the top 8–32px of that covers nothing.
//
// A client component only because it needs the address, the same reason as
// the tip strip above the header.
export default function VideoGuideLink({
  // Defaults to the real one. A prop rather than read inline so the test
  // can render both the "not yet" and the linked version.
  playlistUrl = VIDEO_PLAYLIST_URL,
}: {
  playlistUrl?: string;
}) {
  const pathname = usePathname();
  const title = videoGuideTitle(pathname);

  if (!title) return null;

  const label = (
    <>
      {/* U+FE0E asks for the plain glyph rather than the emoji. Without it
          Windows draws a blue play *button* — which reads as clickable even
          while this is plain text, and looks different on every system.
          The plain one takes the text's own colour instead. */}
      <span aria-hidden className="mr-1.5">
        {"▶︎"}
      </span>
      video &quot;{title}&quot;
    </>
  );

  // Its own dark background rather than bare text, because it has to read
  // over two very different pages: the near-black tools and the light
  // illustrated home page.
  const pillClasses =
    "inline-block whitespace-nowrap rounded-full bg-gray-800/90 px-3 py-1 text-xs shadow-md ring-1 ring-white/10";

  return (
    // No height of its own: the page below starts exactly where it did
    // before. Same width and side padding as the header row, so the pill's
    // right edge lines up with the account button above it.
    <div className="relative mx-auto w-full max-w-7xl">
      {/* z-10 puts it over the page but under the header's menus (z-50),
          which open downwards across this same corner. */}
      <div className="absolute right-4 top-2 z-10">
        {playlistUrl ? (
          // A new tab, because several tools hold unsaved work in a text box
          // (a pasted passage, a half-written check), and following a plain
          // link would navigate it away.
          <a
            href={playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${pillClasses} text-gray-200 transition-colors hover:bg-gray-700 hover:text-white`}
          >
            {label}
          </a>
        ) : (
          <span className={`${pillClasses} text-gray-400`}>{label}</span>
        )}
      </div>
    </div>
  );
}
