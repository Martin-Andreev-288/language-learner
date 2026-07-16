import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getNoteFolderTree } from "@/app/actions/note-folder-actions";
import { NotePage } from "@/app/generated/prisma";
import NoteDashboard from "@/components/shared/note-dashboard";

export default async function ReadingNotesPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Reading Notes"
        description="Take notes on texts and dialogues you're reading."
      />
    );
  }

  const tree = await getNoteFolderTree(NotePage.reading);

  return <NoteDashboard page="reading" data={tree} />;
}
