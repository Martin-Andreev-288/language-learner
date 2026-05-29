import { cookies } from "next/headers";
import { getSSRSession } from "supertokens-node/nextjs";
import { ensureSuperTokensInit } from "@/app/config/backend";
import AuthPrompt from "@/components/shared/auth-prompt";

ensureSuperTokensInit();

export default async function VocabularyPage() {
  const { accessTokenPayload, hasToken } = await getSSRSession(
    (await cookies()).getAll(),
  );

  if (!hasToken || !accessTokenPayload) {
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
          Welcome! This feature is coming soon.
        </p>
      </div>

      <div className="rounded-xl bg-white p-8 shadow-lg">
        <p className="text-center text-gray-500">
          Your vocabulary list will appear here.
        </p>
      </div>
    </div>
  );
}
