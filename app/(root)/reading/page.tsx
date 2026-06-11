import Link from "next/link";
import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";

export default async function ReadingPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Reading Practice"
        description="Read texts and track your vocabulary progress. See which words are new and which you've already learned."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#2c3e50]">
          📖 Reading Practice
        </h1>
        <p className="mt-2 text-gray-600">
          Welcome, {session.user?.name}! This feature is coming soon.
        </p>
      </div>

      <div className="rounded-xl bg-white p-8 shadow-lg">
        <div className="space-y-4 text-center">
          <p className="text-gray-500">
            Reading practice content will appear here.
          </p>
          <Link
            href="/reading/shuffle"
            className="inline-flex items-center rounded-lg bg-[#4facfe] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2f8fe3]"
          >
            Open Reading Shuffle →
          </Link>
        </div>
      </div>
    </div>
  );
}
