import Link from "next/link";
import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";

export default async function VocabularyPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Vocabulary Tracking"
        description="Keep track of all the words you've encountered in reading and writing practice."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#2c3e50]">
          📝 Vocabulary Tracking
        </h1>
        <p className="mt-2 text-gray-600">
          Welcome, {session.user?.name}! This feature is coming soon.
        </p>
      </div>

      <div className="rounded-xl bg-white p-8 shadow-lg">
        <div className="space-y-4 text-center">
          <p className="text-gray-500">
            Your vocabulary list will appear here.
          </p>
          <Link
            href="/vocabulary/shuffle"
            className="inline-flex items-center rounded-lg bg-[#4facfe] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2f8fe3]"
          >
            Open Vocab Shuffle →
          </Link>
        </div>
      </div>
    </div>
  );
}
