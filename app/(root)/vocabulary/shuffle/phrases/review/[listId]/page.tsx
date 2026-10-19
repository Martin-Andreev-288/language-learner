import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import AuthPrompt from "@/components/shared/auth-prompt";
import { featureTool } from "@/lib/feature-sections";
import {
  getShuffleDashboard,
  getShuffleReviewCards,
} from "@/app/actions/shuffle-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import VocabularyShuffleSession from "@/components/shared/vocabulary-shuffle-session";
import { SHUFFLE_SIDES } from "@/lib/shuffle-sides";

// The same entry the menu and the Flashcards page read, rather than a second
// copy of the name here that would have to be remembered at every rename.
const tool = featureTool("/vocabulary/shuffle");

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

export default async function PhraseShuffleReviewPage({
  params,
  searchParams,
}: Props) {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={tool.authName}
        description={tool.description}
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
        tool.label);

  return (
    <VocabularyShuffleSession
      listId={listId}
      type="phrase"
      dashboardPath={SHUFFLE_SIDES.phrase.href}
      listTitle={listTitle}
      initialFilter={initialFilter}
      reviewListIds={
        selectedListIds ? reviewData.listIds : listId === "all" ? [] : [listId]
      }
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
