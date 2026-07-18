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
  searchParams?: Promise<{ filter?: string; lists?: string }>;
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
  const { filter, lists } = searchParams
    ? await searchParams
    : { filter: undefined, lists: undefined };
  const initialFilter = normalizeFilter(filter);
  const selectedListIds = lists
    ? lists.split(",").filter(Boolean)
    : undefined;

  const [reviewData, dashboard] = await Promise.all([
    getShuffleReviewCards({
      type: ShuffleListType.phrase,
      listId,
      filter: "all",
      selectedListIds,
    }),
    getShuffleDashboard(ShuffleListType.phrase),
  ]);

  const listTitle = selectedListIds
    ? `${reviewData.listIds.length} selected list${reviewData.listIds.length !== 1 ? "s" : ""}`
    : listId === "all"
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
