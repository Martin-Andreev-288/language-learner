import Link from "next/link";
import { cookies } from "next/headers";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import { auth } from "@/auth";
import { ALL_FEATURES } from "@/lib/feature-sections";
import { LAST_TOOL_COOKIE, toolForPath } from "@/lib/last-tool";
import { getShuffleReviewSummary } from "@/app/actions/shuffle-actions";
import ContinuePanel from "@/components/shared/continue-panel";

// Both views are built from lib/feature-sections.ts rather than from lists
// written out here (Question 379). The signed-in cards and the guest
// showcase used to be two hand-maintained copies of roughly the same seven
// features, which is how the guest one ended up still advertising an "AI
// Assistant (coming soon)" long after AI had arrived in six of the tools.
export default async function Home() {
  const session = await auth();

  // ─── Authenticated View: Dashboard ───
  if (session) {
    // The panel is an extra. If its query fails, the page still shows the
    // cards, just without due lists, rather than an error in place of the
    // whole home page.
    const [reviewLists, cookieStore] = await Promise.all([
      getShuffleReviewSummary().catch(() => []),
      cookies(),
    ]);
    // Run back through toolForPath rather than used as it is: the cookie
    // can say anything, and only a real tool's address is ever linked.
    const lastToolHref = cookieStore.get(LAST_TOOL_COOKIE)?.value;
    const lastTool = lastToolHref ? toolForPath(lastToolHref) : null;

    return (
      <div className="w-full">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-8">
          {/* Welcome Section — on the same translucent panel as the guest
              hero below, for the same reason (Question 443). */}
          <div className="mb-12 rounded-2xl bg-white/80 px-5 py-8 text-center shadow-lg ring-1 ring-white/60 backdrop-blur-md sm:px-8">
            <h1 className="mb-3 text-3xl font-bold text-[#2c3e50] sm:text-4xl">
              Welcome back, {session.user?.name} 👋
            </h1>
            <p className="text-lg text-[#4a5a69]">
              What would you like to work on today?
            </p>
          </div>

          <ContinuePanel lists={reviewLists} lastTool={lastTool} />

          {/* Quick-Access Feature Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ALL_FEATURES.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="group rounded-xl bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-linear-to-br ${feature.gradient} text-2xl`}
                >
                  {feature.emoji}
                </div>
                <h3 className="mb-1 text-lg font-semibold text-[#2c3e50] group-hover:text-[#667eea]">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
                {/* Says how many tools are behind the card, so the click is
                    a known quantity rather than a guess. The two features
                    that are a single page say nothing and simply open. */}
                {feature.tools.length > 0 && (
                  <p className="mt-3 text-xs font-medium text-gray-400">
                    {feature.tools.length} tools
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Guest View: Marketing / Feature Showcase ───
  return (
    <div className="w-full">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-8">
        {/* Hero Section — on a panel of its own (Question 443). The page
            background is a busy illustration, and the subtitle and the
            "try Shadowing" line are grey text at body size: straight onto
            the picture, parts of both disappeared into it. The feature
            cards further down never had the problem because they sit on
            white, so the hero gets the same kind of surface. Translucent
            and blurred rather than solid, so the illustration still shows
            through — softened behind the text instead of competing with
            it. */}
        <div className="mb-16 rounded-2xl bg-white/80 px-5 py-10 text-center shadow-xl ring-1 ring-white/60 backdrop-blur-md sm:px-8">
          <h1 className="mb-4 text-3xl font-bold text-balance text-[#2c3e50] sm:text-[2.75rem] sm:leading-tight">
            📚 {APP_NAME}
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-[#4a5a69] sm:text-xl">
            {APP_DESCRIPTION}
          </p>

          {/* Call to Action Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <Link
              href="/sign-up"
              className="rounded-lg bg-linear-to-br from-[#667eea] to-[#764ba2] px-8 py-4 text-center text-lg font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            >
              Create a free account
            </Link>
            <Link
              href="/sign-in"
              className="rounded-lg bg-linear-to-br from-[#f093fb] to-[#f5576c] px-8 py-4 text-center text-lg font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            >
              Sign In
            </Link>
          </div>

          {/* The way into the one tool that works signed out (Question 399).
              A third button would have crowded the two that matter; a line
              underneath them offers it without competing.

              Question 385 removed the Analyzer and with it the only "try it
              first" path this page had. This is what puts one back, and it
              is a better one — the Analyzer counted words, while this is the
              app actually doing the thing it is for. */}
          <p className="mt-8 border-t border-gray-200/80 pt-6 text-sm text-[#4a5a69]">
            Or{" "}
            <Link
              href="/speaking/shadowing"
              className="font-semibold text-[#667eea] underline underline-offset-2 transition-colors hover:text-[#4c63d2]"
            >
              try Shadowing Practice without an account
            </Link>{" "}
            first.
          </p>
        </div>

        {/* Features Section */}
        <div>
          <h2 className="mb-8 text-center text-3xl font-bold text-[#2c3e50]">
            What You Can Do
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ALL_FEATURES.map((feature) => (
              <div
                key={feature.href}
                className="rounded-xl bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="mb-4 text-4xl">{feature.emoji}</div>
                <h3 className="mb-2 text-xl font-semibold text-[#2c3e50]">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
                {/* Naming the tools rather than only the section: this is
                    the page that has to convince someone the app is worth
                    signing in to, and "Speaking" alone says far less than
                    the four things it can actually do. */}
                {feature.tools.length > 0 && (
                  <p className="mt-3 text-sm text-gray-400">
                    {feature.tools.map((tool) => tool.label).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
