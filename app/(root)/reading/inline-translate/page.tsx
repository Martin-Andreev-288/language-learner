import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import InlineTranslateTool from "@/components/shared/inline-translate-tool";

const tool = featureTool("/reading/inline-translate");

export default async function InlineTranslatePage() {
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

  return <InlineTranslateTool
      defaultTranslateLanguage={defaultTranslateLanguage}
    />;
}
