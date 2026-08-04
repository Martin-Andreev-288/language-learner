import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import WritingCheckTool from "@/components/shared/writing-check-tool";

export default async function WritingCheckPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Writing Check"
        description="Paste or write something and get mistakes pointed out with a corrected version and an explanation."
      />
    );
  }

  return <WritingCheckTool />;
}
