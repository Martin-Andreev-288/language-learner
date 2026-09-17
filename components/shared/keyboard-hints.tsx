// The line that tells you the keyboard works here (Question 386, item 1).
//
// Every shortcut in this app was already documented — in a `title` on the
// button it belongs to. Which is to say it was documented for someone who
// had already guessed the shortcut existed and gone hunting with a mouse
// for confirmation. That is the wrong way round, and the reason this
// exists: the point of a shortcut is to not reach for the mouse.
//
// Shared by Vocab Shuffle, Reading Shuffle and Shadowing rather than
// written out three times, so a key that changes is corrected once and the
// three screens can't drift into describing themselves differently.

export interface KeyboardHint {
  // Rendered one after another, so ["←", "→"] reads as two keys that do the
  // same thing rather than a range.
  keys: string[];
  label: string;
}

export default function KeyboardHints({
  hints,
  className = "",
}: {
  hints: KeyboardHint[];
  // Spacing comes from the caller and lands on this element rather than on
  // a wrapper around it. With a wrapper, the padding would still be there
  // on a phone after the hints themselves were hidden — dead space at the
  // bottom of every card, on the screens with the least room to give.
  className?: string;
}) {
  return (
    // Hidden below the small breakpoint on purpose. A phone has no keyboard
    // to press any of this with, so on the screen with the least room to
    // spare this would be pure noise — and it is the one piece of UI in the
    // app that can be honestly said to have no mobile use at all.
    <p
      className={`hidden flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-zinc-600 sm:flex ${className}`}
    >
      {hints.map((hint) => (
        <span key={hint.label} className="inline-flex items-center gap-1">
          {hint.keys.map((key) => (
            <kbd
              key={key}
              className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-sans text-[11px] leading-none text-zinc-400"
            >
              {key}
            </kbd>
          ))}
          <span className="ml-0.5">{hint.label}</span>
        </span>
      ))}
    </p>
  );
}
