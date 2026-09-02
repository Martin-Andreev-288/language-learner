import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import AuthPrompt from "@/components/shared/auth-prompt";
import LanguageChat from "@/components/shared/language-chat";

export default async function VoiceChatPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Voice Chat"
        description="Practise a language by having a conversation out loud — pick a language and start talking."
      />
    );
  }

  const defaultTranslateLanguage = await getDefaultTranslateLanguage();

  return <LanguageChat mode="speaking"
      defaultTranslateLanguage={defaultTranslateLanguage}
    />;
}
