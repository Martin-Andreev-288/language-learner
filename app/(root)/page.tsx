import Link from "next/link";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import { auth } from "@/auth";
import { ALL_FEATURES } from "@/lib/feature-sections";

// Both views are built from lib/feature-sections.ts rather than from lists
// written out here (Question 379). The signed-in cards and the guest
// showcase used to be two hand-maintained copies of roughly the same seven
// features, which is how the guest one ended up still advertising an "AI
// Assistant (coming soon)" long after AI had arrived in six of the tools.
export default async function Home() {
  const session = await auth();

  // ─── Authenticated View: Dashboard ───
  if (session) {
    return (
      <div className="w-full">
        <div className="mx-auto max-w-4xl px-8 py-16">
          {/* Welcome Section */}
          <div className="mb-12 text-center">
            <h1 className="mb-3 text-4xl font-bold text-[#2c3e50]">
              Welcome back, {session.user?.name} 👋
            </h1>
            <p className="text-lg text-[#5a6c7d]">
              What would you like to work on today?
            </p>
          </div>

          {/* Quick-Access Feature Cards */}
          <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

          {/* Recent Activity Placeholder */}
          <div className="rounded-xl bg-white p-8 shadow-lg">
            <h2 className="mb-4 text-xl font-bold text-[#2c3e50]">
              📊 Recent Activity
            </h2>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="mb-2 text-gray-500">
                Your learning activity will appear here as you use the app.
              </p>
              <p className="text-sm text-gray-400">
                Start by analyzing a text or practicing your reading!
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Guest View: Marketing / Feature Showcase ───
  return (
    <div className="w-full">
      <div className="mx-auto max-w-4xl px-8 py-16">
        {/* Hero Section */}
        <div className="mb-16 text-center">
          <h1 className="mb-6 text-5xl font-bold text-[#2c3e50] drop-shadow-sm">
            📚 {APP_NAME}
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-[#5a6c7d] leading-relaxed">
            {APP_DESCRIPTION}
          </p>

          {/* Call to Action Buttons */}
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/vocabulary-analyzer"
              className="rounded-lg bg-linear-to-br from-[#667eea] to-[#764ba2] px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            >
              Try as Guest
            </Link>
            <Link
              href="/sign-in"
              className="rounded-lg bg-linear-to-br from-[#f093fb] to-[#f5576c] px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-16">
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

        {/* Quick Start Section */}
        <div className="rounded-xl bg-white p-8 shadow-lg">
          <h2 className="mb-6 text-center text-2xl font-bold text-[#2c3e50]">
            Get Started Now
          </h2>
          <p className="mb-6 text-center text-gray-600">
            Try our Vocabulary Analyzer right now to see how the app works!
          </p>
          <div className="flex justify-center">
            <Link
              href="/vocabulary-analyzer"
              className="rounded-lg bg-linear-to-br from-[#4facfe] to-[#00f2fe] px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            >
              Open Vocabulary Analyzer →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
