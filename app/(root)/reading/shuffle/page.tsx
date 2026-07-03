import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getShuffleDashboard } from "@/app/actions/shuffle-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import VocabularyShuffleDashboard from "@/components/shared/vocabulary-shuffle-dashboard";

export default async function ReadingShufflePage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Reading Shuffle"
        description="Create sentence lists, group them by topics, and review them in randomized order."
      />
    );
  }

  const dashboard = await getShuffleDashboard(ShuffleListType.phrase);

  return (
    <VocabularyShuffleDashboard
      type="phrase"
      reviewBasePath="/reading/shuffle/review"
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
