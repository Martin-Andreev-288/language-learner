import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import { getNoteFolderTree } from "@/app/actions/note-folder-actions";
import { NotePage } from "@/app/generated/prisma";
import NoteDashboard from "@/components/shared/note-dashboard";

const tool = featureTool("/vocabulary/notes");

export default async function VocabularyNotesPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
      />
    );
  }

  const tree = await getNoteFolderTree(NotePage.vocabulary);

  return <NoteDashboard page="vocabulary" data={tree} />;
}
