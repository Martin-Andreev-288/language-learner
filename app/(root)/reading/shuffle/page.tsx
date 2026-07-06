import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getShuffleFolderTree } from "@/app/actions/shuffle-folder-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import VocabularyShuffleDashboard from "@/components/shared/vocabulary-shuffle-dashboard";

export default async function ReadingShufflePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Reading Shuffle"
        description="Create sentence lists, group them by topics, and review them in randomized order."
      />
    );
  }

  const tree = await getShuffleFolderTree(ShuffleListType.phrase);

  return (
    <VocabularyShuffleDashboard
      type="phrase"
      reviewBasePath="/reading/shuffle/review"
      data={tree}
    />
  );
}
