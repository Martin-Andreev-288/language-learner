import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import CheckTool from "@/components/shared/check-tool";

const tool = featureTool("/writing/writing-check");

export default async function WritingCheckPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
      />
    );
  }

  return <CheckTool mode="writing" />;
}
