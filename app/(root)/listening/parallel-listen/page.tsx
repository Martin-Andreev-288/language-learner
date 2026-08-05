import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import ParallelListenTool from "@/components/shared/parallel-listen-tool";

export default async function ParallelListenPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Parallel Listen"
        description="Paste the same passage in two or more languages and listen to only the ones you choose, sentence by sentence."
      />
    );
  }

  return <ParallelListenTool />;
}
