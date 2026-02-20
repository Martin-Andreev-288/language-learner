import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";

export default async function WritingPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Writing Practice"
        description="Practice writing in your target language and track the words you use in your compositions."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#2c3e50]">
          ✍️ Writing Practice
        </h1>
        <p className="mt-2 text-gray-600">
          Welcome, {session.user?.name}! This feature is coming soon.
        </p>
      </div>

      <div className="rounded-xl bg-white p-8 shadow-lg">
        <p className="text-center text-gray-500">
          Writing practice content will appear here.
        </p>
      </div>
    </div>
  );
}
