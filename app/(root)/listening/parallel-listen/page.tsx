import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import ParallelListenTool from "@/components/shared/parallel-listen-tool";

const tool = featureTool("/listening/parallel-listen");

export default async function ParallelListenPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
      />
    );
  }

  return <ParallelListenTool />;
}
