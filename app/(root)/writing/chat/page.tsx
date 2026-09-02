import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import AuthPrompt from "@/components/shared/auth-prompt";
import LanguageChat from "@/components/shared/language-chat";

export default async function ChatPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Chat"
        description="Practise a language by having a conversation — pick a language and start talking."
      />
    );
  }

  const defaultTranslateLanguage = await getDefaultTranslateLanguage();

  return <LanguageChat mode="writing"
      defaultTranslateLanguage={defaultTranslateLanguage}
    />;
}
