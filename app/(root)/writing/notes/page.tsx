import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import { getNoteFolderTree } from "@/app/actions/note-folder-actions";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import { NotePage } from "@/app/generated/prisma";
import NoteDashboard from "@/components/shared/note-dashboard";

const tool = featureTool("/writing/notes");

export default async function WritingNotesPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
      />
    );
  }

  const [tree, defaultTranslateLanguage] = await Promise.all([
    getNoteFolderTree(NotePage.writing),
    getDefaultTranslateLanguage(),
  ]);

  return (
    <NoteDashboard
      page="writing"
      data={tree}
      defaultTranslateLanguage={defaultTranslateLanguage}
    />
  );
}
