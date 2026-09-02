import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getVocabularyEntries } from "@/app/actions/vocabulary-entry-actions";
import VocabularyWordList from "@/components/shared/vocabulary-word-list";

export default async function VocabularyWordListPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Vocabulary"
        description="Keep every word you're learning in one list — add words yourself, or from other tools as they're built."
      />
    );
  }

  const entries = await getVocabularyEntries();
  const defaultTranslateLanguage = await getDefaultTranslateLanguage();

  return (
    <VocabularyWordList
      entries={entries}
      defaultTranslateLanguage={defaultTranslateLanguage}
    />
  );
}
