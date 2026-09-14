import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import InlineListenTool from "@/components/shared/inline-listen-tool";

const tool = featureTool("/listening/inline-listen");

export default async function InlineListenPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
      />
    );
  }

  return <InlineListenTool />;
}
