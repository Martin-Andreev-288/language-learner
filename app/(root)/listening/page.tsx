import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";

export default async function ListeningPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Listening"
        description="Sharpen your listening comprehension with audio practice."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#2c3e50]">🎧 Listening</h1>
        <p className="mt-2 text-gray-600">
          Welcome, {session.user?.name}! This feature is coming soon.
        </p>
      </div>

      <div className="rounded-xl bg-white p-8 shadow-lg">
        <p className="text-center text-gray-500">
          Your listening exercises will appear here.
        </p>
      </div>
    </div>
  );
}
