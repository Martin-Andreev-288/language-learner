"use client";

// Shows how much of an input's allowance is used, so the ceiling is visible
// before it's reached rather than discovered by being rejected (Question
// 271). Pairs with `maxLength` on the field itself: the cap is what makes
// the limit unhittable, this is what makes it knowable.
//
// Stays quiet until the value is most of the way there — a counter sitting
// under an empty box is noise, and these limits are generous enough that
// most passages never approach them.
export default function CharacterCount({
  value,
  max,
  showFrom = 0.75,
}: {
  value: string;
  max: number;
  // Fraction of the limit at which the counter appears.
  showFrom?: number;
}) {
  const used = value.length;
  if (used < max * showFrom) return null;

  const atLimit = used >= max;
  return (
    <p
      className={`mt-1 text-right text-xs ${
        atLimit ? "text-amber-400" : "text-zinc-500"
      }`}
    >
      {used.toLocaleString()} / {max.toLocaleString()} characters
      {atLimit && " — that's the maximum"}
    </p>
  );
}
