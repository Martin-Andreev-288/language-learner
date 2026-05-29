import { cookies } from "next/headers";
import { getSSRSession } from "supertokens-node/nextjs";
import { ensureSuperTokensInit } from "@/app/config/backend";
import VocabularyAnalyzerClient from "@/components/shared/vocabulary-analyzer-client";

ensureSuperTokensInit();

export default async function VocabularyAnalyzerPage() {
  const { accessTokenPayload, hasToken } = await getSSRSession(
    (await cookies()).getAll(),
  );

  return (
    <VocabularyAnalyzerClient
      isAuthenticated={!!(hasToken && accessTokenPayload)}
    />
  );
}
