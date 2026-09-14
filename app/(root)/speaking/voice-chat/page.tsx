import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import LanguageChat from "@/components/shared/language-chat";

const tool = featureTool("/speaking/voice-chat");

export default async function VoiceChatPage() {
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

  return <LanguageChat mode="speaking"
      defaultTranslateLanguage={defaultTranslateLanguage}
    />;
}
