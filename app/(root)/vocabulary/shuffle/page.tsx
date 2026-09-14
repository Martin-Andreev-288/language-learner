import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import { getShuffleFolderTree } from "@/app/actions/shuffle-folder-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import VocabularyShuffleDashboard from "@/components/shared/vocabulary-shuffle-dashboard";

const tool = featureTool("/vocabulary/shuffle");

export default async function VocabularyShufflePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
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
