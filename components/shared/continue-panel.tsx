"use client";

import Link from "next/link";
import { isDue } from "@/lib/shuffle-schedule";
import { SHUFFLE_SIDES } from "@/lib/shuffle-sides";
import type { LastTool } from "@/lib/last-tool";

export type ContinueList = {
  id: string;
  title: string;
  type: "word" | "phrase";
  reviewCount: number;
  lastReviewedAt: string | Date | null;
  cardCount: number;
};

// Each row opens that Shuffle page rather than a review of every due list
// at once: you may want them one at a time, in an order of your own, and
// the page marks each due list and has its own Review due card for the
// all-at-once case.
const LIST_KINDS = [
  { type: "word", noun: "word", dashboardPath: SHUFFLE_SIDES.word.href },
  { type: "phrase", noun: "phrase", dashboardPath: SHUFFLE_SIDES.phrase.href },
] as const;

function plural(count: number, noun: string) {
  return `${count} ${noun}${count !== 1 ? "s" : ""}`;
}

// The top of the signed-in home page: what is waiting for you, rather than
// the same six cards the menu already has. The cards stay, below this.
//
// A client component only for the clock: which lists are due is counted in
// the viewer's own time zone, the same way the Shuffle page counts it, so
// the two never disagree about what is due today.
//
// Shows nothing at all when nothing is due and no tool has been used yet,
// so a new account sees the page exactly as it was.
export default function ContinuePanel({
  lists,
  lastTool,
}: {
  lists: ContinueList[];
  lastTool: LastTool | null;
}) {
  const now = new Date();
  const dueRows = LIST_KINDS.map((kind) => {
    // An empty list has nothing to review, so it is never due.
    const due = lists.filter(
      (list) => list.type === kind.type && list.cardCount > 0 && isDue(list, now),
    );
    return {
      ...kind,
      due,
      cardCount: due.reduce((sum, list) => sum + list.cardCount, 0),
    };
  }).filter((row) => row.due.length > 0);

  if (dueRows.length === 0 && !lastTool) return null;

  return (
    <section className="mb-8 rounded-xl bg-white p-6 shadow-lg">
      <h2 className="mb-4 text-lg font-semibold text-[#2c3e50]">Continue</h2>
      <ul className="divide-y divide-gray-100">
        {dueRows.map((row) => (
          <li key={row.type} className="py-3 first:pt-0 last:pb-0">
            <Link href={row.dashboardPath} className="group flex items-center gap-4">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[#2c3e50] group-hover:text-[#667eea]">
                  {plural(row.due.length, `${row.noun} list`)} due ·{" "}
                  {plural(row.cardCount, row.noun)}
                </span>
                <span className="block truncate text-sm text-gray-500">
                  {row.due.map((list) => list.title).join(", ")}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium text-[#667eea]">
                Open →
              </span>
            </Link>
          </li>
        ))}
        {lastTool && (
          <li className="py-3 first:pt-0 last:pb-0">
            <Link href={lastTool.href} className="group flex items-center gap-4">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-gray-500">Last used</span>
                <span className="block font-medium text-[#2c3e50] group-hover:text-[#667eea]">
                  {lastTool.name}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium text-[#667eea]">
                Open →
              </span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
