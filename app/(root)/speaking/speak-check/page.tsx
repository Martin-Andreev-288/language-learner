import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import CheckTool from "@/components/shared/check-tool";

export default async function SpeakCheckPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Speak Check"
        description="Say something in the language you're learning and get mistakes pointed out with a corrected version and an explanation."
      />
    );
  }

  return <CheckTool mode="speaking" />;
}
