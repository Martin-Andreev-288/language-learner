import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getNoteFolderTree } from "@/app/actions/note-folder-actions";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import { NotePage } from "@/app/generated/prisma";
import NoteDashboard from "@/components/shared/note-dashboard";

export default async function NotesPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Notes"
        description="Take notes on grammar rules, vocabulary, and anything else you want to remember."
      />
    );
  }

  const [tree, defaultTranslateLanguage] = await Promise.all([
    getNoteFolderTree(NotePage.general),
    getDefaultTranslateLanguage(),
  ]);

  return (
    <NoteDashboard
      page="general"
      data={tree}
      defaultTranslateLanguage={defaultTranslateLanguage}
    />
  );
}
