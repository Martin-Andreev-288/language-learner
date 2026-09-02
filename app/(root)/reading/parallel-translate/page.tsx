import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import AuthPrompt from "@/components/shared/auth-prompt";
import ParallelTranslateTool from "@/components/shared/parallel-translate-tool";

export default async function ParallelTranslatePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Parallel Translate"
        description="Paste the same passage in two or more languages and get it back aligned sentence by sentence."
      />
    );
  }

  const defaultTranslateLanguage = await getDefaultTranslateLanguage();

  return <ParallelTranslateTool
      defaultTranslateLanguage={defaultTranslateLanguage}
    />;
}
