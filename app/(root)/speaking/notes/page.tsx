import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getNoteFolderTree } from "@/app/actions/note-folder-actions";
import { NotePage } from "@/app/generated/prisma";
import NoteDashboard from "@/components/shared/note-dashboard";

export default async function SpeakingNotesPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Speaking Notes"
        description="Take notes on pronunciation and phrasing for your speaking practice."
      />
    );
  }

  const tree = await getNoteFolderTree(NotePage.speaking);

  return <NoteDashboard page="speaking" data={tree} />;
}
