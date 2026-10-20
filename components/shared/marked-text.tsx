import type { CorrectionSpan } from "@/lib/correction-spans";

// A checked text with its mistakes marked, the look Writing Check has had
// since it was built and the chats now share. Clicking a mark is left to
// the caller, because what it should lead to differs: Writing Check scrolls
// a long page to the explanation, a chat only has to light up the line
// right underneath.
export default function MarkedText({
  text,
  spans,
  badges,
  onMarkClick,
}: {
  text: string;
  spans: CorrectionSpan[];
  badges: Map<number, number>;
  onMarkClick?: (correctionIndex: number) => void;
}) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  spans.forEach((span) => {
    if (span.start > cursor) {
      nodes.push(text.slice(cursor, span.start));
    }
    nodes.push(
      <mark
        key={span.start}
        onClick={onMarkClick ? () => onMarkClick(span.index) : undefined}
        title={`Correction ${badges.get(span.index)}`}
        className={`rounded bg-red-500/25 px-0.5 text-red-200 underline decoration-red-500 decoration-2 underline-offset-2 transition-colors ${
          onMarkClick ? "cursor-pointer hover:bg-red-500/40" : ""
        }`}
      >
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return <>{nodes}</>;
}
