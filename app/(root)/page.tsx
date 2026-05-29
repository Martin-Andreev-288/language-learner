import Link from "next/link";
import { cookies } from "next/headers";
import { getSSRSession } from "supertokens-node/nextjs";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import { ensureSuperTokensInit } from "@/app/config/backend";
import { prisma } from "@/lib/prisma";

ensureSuperTokensInit();

// Dashboard feature cards for authenticated users
const dashboardFeatures = [
  {
    href: "/reading",
    emoji: "📖",
    title: "Reading Practice",
    description: "Read texts and track your vocabulary progress.",
    gradient: "from-[#667eea] to-[#764ba2]",
  },
  {
    href: "/writing",
    emoji: "✍️",
    title: "Writing Practice",
    description: "Practice writing in your target language.",
    gradient: "from-[#f093fb] to-[#f5576c]",
  },
  {
    href: "/vocabulary",
    emoji: "📝",
    title: "Vocabulary",
    description: "Track words from reading and writing practice.",
    gradient: "from-[#4facfe] to-[#00f2fe]",
  },
  {
    href: "/vocabulary-analyzer",
    emoji: "🔍",
    title: "Analyzer",
    description: "Analyze any text for word frequency and progress.",
    gradient: "from-[#43e97b] to-[#38f9d7]",
  },
  {
    href: "/notes",
    emoji: "📓",
    title: "Notes",
    description: "Take notes on grammar, vocabulary, and more.",
    gradient: "from-[#fa709a] to-[#fee140]",
  },
];

export default async function Home() {
  const { accessTokenPayload, hasToken } = await getSSRSession(
    (await cookies()).getAll(),
  );
  let user: { name: string | null; email: string | null } | null = null;
  if (hasToken && accessTokenPayload?.sub) {
    const dbUser = await prisma.user.findUnique({
      where: { id: accessTokenPayload.sub as string },
      select: { name: true, email: true },
    });
    if (dbUser) user = dbUser;
  }

  // ─── Authenticated View: Dashboard ───
  if (user) {
    return (
      <div className="w-full">
        <div className="mx-auto max-w-4xl px-8 py-16">
          {/* Welcome Section */}
          <div className="mb-12 text-center">
            <h1 className="mb-3 text-4xl font-bold text-[#2c3e50]">
              Welcome back, {user.name ?? user.email} 👋
            </h1>
            <p className="text-lg text-[#5a6c7d]">
              What would you like to work on today?
            </p>
          </div>

          {/* Quick-Access Feature Cards */}
          <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {dashboardFeatures.map((feature) => (
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

  // ─── Guest View: Marketing / Feature Showcase (unchanged) ───
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
              href="/auth"
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
            {/* Reading Feature */}
            <div className="rounded-xl bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-4 text-4xl">📖</div>
              <h3 className="mb-2 text-xl font-semibold text-[#2c3e50]">
                Reading Practice
              </h3>
              <p className="text-gray-600">
                Read texts and track your vocabulary progress. See which words
                are new and which you&apos;ve already learned.
              </p>
            </div>

            {/* Writing Feature */}
            <div className="rounded-xl bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-4 text-4xl">✍️</div>
              <h3 className="mb-2 text-xl font-semibold text-[#2c3e50]">
                Writing Practice
              </h3>
              <p className="text-gray-600">
                Practice writing in your target language and track the words you
                use in your compositions.
              </p>
            </div>

            {/* Vocabulary Feature */}
            <div className="rounded-xl bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-4 text-4xl">📝</div>
              <h3 className="mb-2 text-xl font-semibold text-[#2c3e50]">
                Vocabulary Tracking
              </h3>
              <p className="text-gray-600">
                Keep track of all the words you&apos;ve encountered in reading
                and writing practice.
              </p>
            </div>

            {/* Vocabulary Analyzer Feature */}
            <div className="rounded-xl bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-4 text-4xl">🔍</div>
              <h3 className="mb-2 text-xl font-semibold text-[#2c3e50]">
                Vocabulary Analyzer
              </h3>
              <p className="text-gray-600">
                Analyze any text to see word counts, identify new vs. repeated
                words, and track your progress.
              </p>
            </div>

            {/* Notes Feature */}
            <div className="rounded-xl bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-4 text-4xl">📓</div>
              <h3 className="mb-2 text-xl font-semibold text-[#2c3e50]">
                Notes
              </h3>
              <p className="text-gray-600">
                Take notes on grammar rules, vocabulary, and anything else you
                want to remember.
              </p>
            </div>

            {/* AI Feature (Coming Soon) */}
            <div className="rounded-xl bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-4 text-4xl">🤖</div>
              <h3 className="mb-2 text-xl font-semibold text-[#2c3e50]">
                AI Assistant
              </h3>
              <p className="text-gray-600">
                Get personalized recommendations and translations powered by AI
                (coming soon).
              </p>
            </div>
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
