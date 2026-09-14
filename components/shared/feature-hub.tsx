import Link from "next/link";
import type { FeatureSection } from "@/lib/feature-sections";

// The page you land on when you click a section name (Question 379).
//
// One component for all five, because the only thing that differs between
// them is the list in lib/feature-sections.ts. Five near-identical pages
// would be five places to fix a spacing bug.
//
// What it deliberately isn't: a copy of the header dropdown with a border
// round it. The dropdown is for people who already know what they want and
// are aiming at it; this is for the click that says "show me what is here",
// so each tool gets the sentence explaining what it does rather than just
// its name.
export default function FeatureHub({ section }: { section: FeatureSection }) {
  return (
    <div className="mx-auto max-w-4xl px-8 py-16">
      <div className="mb-10 flex items-start gap-4">
        <div
          className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${section.gradient} text-3xl shadow-md`}
        >
          {section.emoji}
        </div>
        <div>
          <h1 className="text-3xl font-bold text-[#2c3e50]">{section.title}</h1>
          <p className="mt-2 text-gray-600">{section.description}</p>
        </div>
      </div>

      {/* Two columns rather than the home page's three: these cards
          carry a full sentence each, and a third column would squeeze
          every one of them into an extra line for no gain. */}
      <div className="grid gap-5 sm:grid-cols-2">
        {section.tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group relative flex flex-col overflow-hidden rounded-xl bg-white py-6 pl-7 pr-6 shadow-md ring-1 ring-gray-900/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-gray-900/10"
          >
            {/* The section's own gradient, down the edge of every tool in
                it (Question 381). This is what the tool cards were missing:
                not decoration, but the thing that says which section you
                are standing in — the same colours as the tile at the top of
                the page and as this section's card on the home page.

                It also solves what an emoji would have solved, without the
                cost: seventeen tools would have meant seventeen invented
                icons, and an icon chosen because a slot existed says less
                than the sentence already underneath it. */}
            <span
              aria-hidden
              className={`absolute inset-y-0 left-0 w-1 bg-linear-to-b ${section.gradient} transition-all duration-300 group-hover:w-2`}
            />

            <h2 className="mb-2 text-lg font-semibold text-[#2c3e50] transition-colors group-hover:text-[#667eea]">
              {tool.label}
            </h2>
            <p className="flex-1 text-sm leading-relaxed text-gray-600">
              {tool.description}
            </p>

            {/* Always visible, rather than fading in on hover as it did
                first. A hover-only affordance is invisible on a phone,
                where there is no hover at all — so the card would simply
                never show that it opens anything. Only the arrow moves. */}
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#667eea]">
              Open
              <span className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
