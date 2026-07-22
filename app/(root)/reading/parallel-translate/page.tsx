import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import ParallelTranslateTool from "@/components/shared/parallel-translate-tool";

export default async function ParallelTranslatePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Parallel Translate"
        description="Paste the same passage in two or more languages and get it back aligned sentence by sentence."
      />
    );
  }

  return <ParallelTranslateTool />;
}
