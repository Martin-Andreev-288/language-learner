import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getNoteFolderTree } from "@/app/actions/note-folder-actions";
import { NotePage } from "@/app/generated/prisma";
import NoteDashboard from "@/components/shared/note-dashboard";

export default async function ListeningNotesPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Listening Notes"
        description="Take notes on what you're listening to."
      />
    );
  }

  const tree = await getNoteFolderTree(NotePage.listening);

  return <NoteDashboard page="listening" data={tree} />;
}
