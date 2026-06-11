import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import {
  getShuffleDashboard,
  getShuffleReviewCards,
} from "@/app/actions/shuffle-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import VocabularyShuffleSession from "@/components/shared/vocabulary-shuffle-session";

type Props = {
  params: Promise<{ listId: string }>;
  searchParams?: Promise<{ filter?: string }>;
};

function normalizeFilter(filter?: string) {
  if (
    filter === "all" ||
    filter === "memorized" ||
    filter === "favorites" ||
    filter === "unmemorized"
  ) {
    return filter;
  }

  return "unmemorized" as const;
}

export default async function ReadingShuffleReviewPage({
  params,
  searchParams,
}: Props) {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Reading Shuffle"
        description="Create sentence lists, group them by topics, and review them in randomized order."
      />
    );
  }

  const { listId } = await params;
  const { filter } = searchParams ? await searchParams : { filter: undefined };
  const initialFilter = normalizeFilter(filter);

  const [reviewData, dashboard] = await Promise.all([
    getShuffleReviewCards({
      type: ShuffleListType.phrase,
      listId,
      filter: "all",
    }),
    getShuffleDashboard(ShuffleListType.phrase),
  ]);

  const listTitle =
    listId === "all"
      ? "All Phrase Lists"
      : (dashboard.lists.find((list) => list.id === listId)?.title ??
        "Reading Shuffle");

  return (
    <VocabularyShuffleSession
      listId={listId}
      type="phrase"
      dashboardPath="/reading/shuffle"
      listTitle={listTitle}
      initialFilter={initialFilter}
      cards={reviewData.cards.map((card) => ({
        id: card.id,
        listId: card.listId,
        text: card.text,
        memorized: card.memorized,
        favorite: card.favorite,
        list: {
          id: card.list.id,
          title: card.list.title,
          type: card.list.type,
        },
      }))}
    />
  );
}
