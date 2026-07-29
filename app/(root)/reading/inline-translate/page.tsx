import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import InlineTranslateTool from "@/components/shared/inline-translate-tool";

export default async function InlineTranslatePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Inline Translate"
        description="Click the words you don't know in a pasted passage and get their translation inserted right next to them."
      />
    );
  }

  return <InlineTranslateTool />;
}
