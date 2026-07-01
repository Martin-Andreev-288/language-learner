import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import {
  getShuffleLists,
  getUnmemorizedGroups,
} from "@/app/actions/shuffle-actions";
import { ShuffleListType } from "@/app/generated/prisma";
import UnmemorizedGroups from "@/components/shared/unmemorized-groups";

type Props = {
  searchParams?: Promise<{ type?: string }>;
};

function parseType(type?: string): "word" | "phrase" | undefined {
  if (type === "word" || type === "phrase") {
    return type;
  }

  return undefined;
}

export default async function UnmemorizedPage({ searchParams }: Props) {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName="Unmemorized"
        description="Review everything that is still not memorized across your shuffle lists."
      />
    );
  }

  const { type } = searchParams ? await searchParams : { type: undefined };
  const typeFilter = parseType(type);
  const prismaType =
    typeFilter === "word"
      ? ShuffleListType.word
      : typeFilter === "phrase"
        ? ShuffleListType.phrase
        : undefined;

  const [groupsData, lists] = await Promise.all([
    getUnmemorizedGroups(prismaType),
    getShuffleLists(prismaType),
  ]);

  return (
    <UnmemorizedGroups
      typeFilter={typeFilter}
      groups={groupsData.groups.map((group) => ({
        listId: group.listId,
        title: group.title,
        type: group.type,
        unmemorizedCount: group.unmemorizedCount,
      }))}
      totals={groupsData.totals}
      existingLists={lists.map((list) => ({
        id: list.id,
        title: list.title,
        type: list.type,
      }))}
    />
  );
}
