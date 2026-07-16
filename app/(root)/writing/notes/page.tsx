import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getNoteFolderTree } from "@/app/actions/note-folder-actions";
import { NotePage } from "@/app/generated/prisma";
import NoteDashboard from "@/components/shared/note-dashboard";

export default async function WritingNotesPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Writing Notes"
        description="Take notes on grammar rules and phrasing for your writing practice."
      />
    );
  }

  const tree = await getNoteFolderTree(NotePage.writing);

  return <NoteDashboard page="writing" data={tree} />;
}
