import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import ShadowingTool from "@/components/shared/shadowing-tool";

export default async function ShadowingPracticePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Shadowing Practice"
        description="Paste a passage and go through it one sentence at a time to practice repeating it out loud."
      />
    );
  }

  return <ShadowingTool />;
}
