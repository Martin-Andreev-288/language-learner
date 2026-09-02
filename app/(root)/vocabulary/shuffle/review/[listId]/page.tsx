import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
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
  const { filter, lists } = searchParams
    ? await searchParams
    : { filter: undefined, lists: undefined };
  const initialFilter = normalizeFilter(filter);
  const selectedListIds = lists
    ? lists.split(",").filter(Boolean)
    : undefined;

  const defaultTranslateLanguage = await getDefaultTranslateLanguage();

  const [reviewData, dashboard] = await Promise.all([
    getShuffleReviewCards({
      type: ShuffleListType.word,
      listId,
      filter: "all",
      selectedListIds,
    }),
    getShuffleDashboard(ShuffleListType.word),
  ]);

  const listTitle = selectedListIds
    ? `${reviewData.listIds.length} selected list${reviewData.listIds.length !== 1 ? "s" : ""}`
    : listId === "all"
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
      defaultTranslateLanguage={defaultTranslateLanguage}
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
