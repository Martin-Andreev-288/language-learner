import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import { getUnmemorizedListDetail } from "@/app/actions/shuffle-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import UnmemorizedListDetail from "@/components/shared/unmemorized-list-detail";

type Props = {
  params: Promise<{ listId: string }>;
  searchParams?: Promise<{ type?: string }>;
};

function parseType(type?: string): "word" | "phrase" | undefined {
  if (type === "word" || type === "phrase") {
    return type;
  }

  return undefined;
}

export default async function UnmemorizedListDetailPage({
  params,
  searchParams,
}: Props) {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Unmemorized"
        description="Review everything that is still not memorized across your flashcard lists."
      />
    );
  }

  const { listId } = await params;
  const { type } = searchParams ? await searchParams : { type: undefined };
  const typeFilter = parseType(type);
  const prismaType =
    typeFilter === "word"
      ? ShuffleListType.word
      : typeFilter === "phrase"
        ? ShuffleListType.phrase
        : undefined;

  const detail = await getUnmemorizedListDetail(listId, prismaType);

  return (
    <UnmemorizedListDetail
      typeFilter={typeFilter}
      list={{
        id: detail.list.id,
        title: detail.list.title,
        type: detail.list.type,
      }}
      cards={detail.cards.map((card) => ({
        id: card.id,
        listId: card.listId,
        text: card.text,
        memorized: card.memorized,
        favorite: card.favorite,
      }))}
    />
  );
}
