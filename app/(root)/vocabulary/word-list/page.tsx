import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import { getVocabularyEntries } from "@/app/actions/vocabulary-entry-actions";
import VocabularyWordList from "@/components/shared/vocabulary-word-list";

const tool = featureTool("/vocabulary/word-list");

export default async function VocabularyWordListPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
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
