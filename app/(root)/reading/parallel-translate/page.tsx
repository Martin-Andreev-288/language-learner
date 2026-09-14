import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import ParallelTranslateTool from "@/components/shared/parallel-translate-tool";

const tool = featureTool("/reading/parallel-translate");

export default async function ParallelTranslatePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
      />
    );
  }

  const defaultTranslateLanguage = await getDefaultTranslateLanguage();

  return <ParallelTranslateTool
      defaultTranslateLanguage={defaultTranslateLanguage}
    />;
}
