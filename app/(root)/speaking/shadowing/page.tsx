import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import ShadowingTool from "@/components/shared/shadowing-tool";

const tool = featureTool("/speaking/shadowing");

export default async function ShadowingPracticePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
      />
    );
  }

  return <ShadowingTool />;
}
