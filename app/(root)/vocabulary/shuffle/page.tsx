import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getShuffleFolderTree } from "@/app/actions/shuffle-folder-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import VocabularyShuffleDashboard from "@/components/shared/vocabulary-shuffle-dashboard";

export default async function VocabularyShufflePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Vocabulary Shuffle"
        description="Create word lists, group them by topics, and review them in randomized order."
      />
    );
  }

  const tree = await getShuffleFolderTree(ShuffleListType.word);

  return (
    <VocabularyShuffleDashboard
      type="word"
      reviewBasePath="/vocabulary/shuffle/review"
      data={tree}
    />
  );
}
