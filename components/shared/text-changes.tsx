import { diffWords } from "@/lib/word-diff";

// The corrected text with every change from the original drawn in place:
// removed words struck through in red, added ones in green, everything
// else as it is. <del> and <ins> rather than styled spans, so a screen
// reader announces them as deletions and insertions too.
export default function TextChanges({
  before,
  after,
}: {
  before: string;
  after: string;
}) {
  return (
    <>
      {diffWords(before, after).map((segment, index) =>
        segment.kind === "removed" ? (
          <del
            key={index}
            // A thick line rather than the browser's hairline: the struck-
            // through look is what tells a removal apart from an addition
            // without relying on red and green.
            className="rounded bg-red-500/15 px-0.5 text-red-300 line-through decoration-red-400 decoration-2"
          >
            {segment.text}
          </del>
        ) : segment.kind === "added" ? (
          <ins
            key={index}
            className="rounded bg-emerald-500/20 px-0.5 text-emerald-200 no-underline"
          >
            {segment.text}
          </ins>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
