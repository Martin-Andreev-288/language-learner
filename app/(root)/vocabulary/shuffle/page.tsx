import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getShuffleDashboard } from "@/app/actions/shuffle-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import VocabularyShuffleDashboard from "@/components/shared/vocabulary-shuffle-dashboard";

export default async function VocabularyShufflePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Vocabulary Shuffle"
        description="Create word lists, group them by topics, and review them in randomized order."
      />
    );
  }

  const dashboard = await getShuffleDashboard(ShuffleListType.word);

  return (
    <VocabularyShuffleDashboard
      type="word"
      reviewBasePath="/vocabulary/shuffle/review"
      data={{
        lists: dashboard.lists.map((list) => ({
          id: list.id,
          title: list.title,
          type: list.type,
          counts: list.counts,
          reviewCount: list.reviewCount,
          lastReviewedAt: list.lastReviewedAt,
        })),
        totals: dashboard.totals,
      }}
    />
  );
}
