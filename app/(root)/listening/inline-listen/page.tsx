import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import InlineListenTool from "@/components/shared/inline-listen-tool";

export default async function InlineListenPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Inline Listen"
        description="Paste a passage — or send one from Inline Translate — and listen to it sentence by sentence."
      />
    );
  }

  return <InlineListenTool />;
}
