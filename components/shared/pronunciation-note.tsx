import Link from "next/link";

// The line on the pages where you speak but only your words are checked —
// Writing Check's dictation and Voice Chat (Answer 54). Both hand the check
// the browser's text, and the browser writes the word you meant: "müde" for
// a spoken "mude". After Shadowing has told you a sound came out wrong, it
// is fair to expect the same wherever else you speak, so each page says, in
// its own words, what it checks; and both end the same way, here, pointing
// to the one page that listens to the sound.
//
// A new tab, like the video link: both pages hold something unsaved — a
// text being checked, a conversation — that a plain link would leave.
export default function PronunciationNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-xs text-zinc-600 ${className}`}>
      {children} For feedback on sounds, try{" "}
      <Link
        href="/speaking/shadowing"
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200"
      >
        Shadowing Practice
      </Link>
      .
    </p>
  );
}
