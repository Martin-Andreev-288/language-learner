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

export default async function VocabularyShuffleReviewPage({
  params,
  searchParams,
}: Props) {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Vocabulary Shuffle"
        description="Create word lists, group them by topics, and review them in randomized order."
      />
    );
  }

  const { listId } = await params;
  const { filter } = searchParams ? await searchParams : { filter: undefined };
  const initialFilter = normalizeFilter(filter);

  const [reviewData, dashboard] = await Promise.all([
    getShuffleReviewCards({
      type: ShuffleListType.word,
      listId,
      filter: "all",
    }),
    getShuffleDashboard(ShuffleListType.word),
  ]);

  const listTitle =
    listId === "all"
      ? "All Vocabulary Lists"
      : (dashboard.lists.find((list) => list.id === listId)?.title ??
        "Vocabulary Shuffle");

  return (
    <VocabularyShuffleSession
      listId={listId}
      type="word"
      dashboardPath="/vocabulary/shuffle"
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
