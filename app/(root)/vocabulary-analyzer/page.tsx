import { auth } from "@/auth";
import VocabularyAnalyzerClient from "@/components/shared/vocabulary-analyzer-client";

export default async function VocabularyAnalyzerPage() {
  const session = await auth();

  return <VocabularyAnalyzerClient isAuthenticated={!!session} />;
}
