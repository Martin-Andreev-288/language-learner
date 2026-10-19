import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import { getShuffleFolderTree } from "@/app/actions/shuffle-folder-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import VocabularyShuffleDashboard from "@/components/shared/vocabulary-shuffle-dashboard";
import { shuffleReviewBasePath } from "@/lib/shuffle-sides";

// The phrases side of Vocabulary → Shuffle. It has no menu entry of its own;
// the Words | Phrases switch on the page is the way here, so it shares the
// Shuffle entry's name and description.
const tool = featureTool("/vocabulary/shuffle");

export default async function PhraseShufflePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
      />
    );
  }

  const tree = await getShuffleFolderTree(ShuffleListType.phrase);

  return (
    <VocabularyShuffleDashboard
      type="phrase"
      reviewBasePath={shuffleReviewBasePath("phrase")}
      data={tree}
    />
  );
}
