import Link from "next/link";

// Stands in for a control a guest can see but can't press (Question 399).
//
// The shape of this is the whole point of try-before-signup, so it is worth
// stating: it replaces the button rather than hiding it. A feature a visitor
// never learns exists cannot persuade them to make an account, and a button
// that looks pressable and then refuses is a worse introduction than one
// that says plainly what it wants first.
//
// Worth being clear about what this is *not*: it is not what keeps a guest
// out. Every action behind these buttons checks the session itself and
// throws if there isn't one — that check is the boundary and it hasn't
// moved. This is the explanation in front of it, and removing it would
// change what a visitor is told, not what they can do.
export default function SignInToUse({
  // Named as the thing itself — "Generating a passage", "Checking your
  // attempt" — so the sentence reads as a fact about that feature rather
  // than as a generic refusal pasted in three places.
  what,
  className = "",
}: {
  what: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-3 ${className}`}
    >
      <p className="text-sm text-zinc-300">{what} needs an account.</p>
      <p className="mt-1.5 text-sm">
        <Link
          href="/sign-up"
          className="font-medium text-indigo-400 transition-colors hover:text-indigo-300"
        >
          Create a free one
        </Link>
        <span className="text-zinc-600"> · </span>
        <Link
          href="/sign-in"
          className="font-medium text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
