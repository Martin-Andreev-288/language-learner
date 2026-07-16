import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getNoteFolderTree } from "@/app/actions/note-folder-actions";
import { NotePage } from "@/app/generated/prisma";
import NoteDashboard from "@/components/shared/note-dashboard";

export default async function VocabularyNotesPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Vocabulary Notes"
        description="Take notes on words, phrases, and usage you want to remember."
      />
    );
  }

  const tree = await getNoteFolderTree(NotePage.vocabulary);

  return <NoteDashboard page="vocabulary" data={tree} />;
}
