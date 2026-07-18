"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShuffleListType } from "@/app/generated/prisma";

export type ShuffleFilter = "all" | "unmemorized" | "memorized" | "favorites";
export type ShuffleClientType = "word" | "phrase";

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }
    return session.user.id;
}

function parseItems(items: string): string[] {
    return items
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

async function requireOwnedList(userId: string, listId: string) {
    const list = await prisma.shuffleList.findFirst({
        where: { id: listId, userId },
    });

    if (!list) {
        throw new Error("List not found");
    }

    return list;
}

async function requireOwnedCard(userId: string, cardId: string) {
    const card = await prisma.shuffleCard.findFirst({
        where: { id: cardId, list: { userId } },
        include: {
            list: {
                select: { id: true, userId: true, type: true, title: true },
            },
        },
    });

    if (!card) {
        throw new Error("Card not found");
    }

    return card;
}

export async function createShuffleList(type: ShuffleListType, title: string) {
    const userId = await requireUserId();
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
        throw new Error("List title is required");
    }

    return prisma.shuffleList.create({
        data: {
            userId,
            type,
            title: normalizedTitle,
        },
    });
}

export async function renameShuffleList(listId: string, title: string) {
    const userId = await requireUserId();
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
        throw new Error("List title is required");
    }

    await requireOwnedList(userId, listId);

    return prisma.shuffleList.update({
        where: { id: listId },
        data: { title: normalizedTitle },
    });
}

export async function deleteShuffleList(listId: string) {
    const userId = await requireUserId();

    await requireOwnedList(userId, listId);

    return prisma.shuffleList.delete({
        where: { id: listId },
    });
}

export async function markShuffleListReviewed(listId: string) {
    const userId = await requireUserId();

    await requireOwnedList(userId, listId);

    return prisma.shuffleList.update({
        where: { id: listId },
        data: {
            reviewCount: { increment: 1 },
            lastReviewedAt: new Date(),
        },
    });
}

export async function appendCardsToShuffleList(listId: string, items: string) {
    const userId = await requireUserId();

    await requireOwnedList(userId, listId);

    const parsed = parseItems(items);

    if (parsed.length === 0) {
        throw new Error("No valid items provided");
    }

    const created = await prisma.shuffleCard.createManyAndReturn({
        data: parsed.map((text) => ({
            listId,
            text,
            memorized: false,
            favorite: false,
        })),
        select: {
            id: true,
            listId: true,
            text: true,
            memorized: true,
            favorite: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return { createdCount: created.length, created };
}

export async function createShuffleListWithCards(
    type: ShuffleListType,
    title: string,
    items: string,
) {
    const userId = await requireUserId();
    const normalizedTitle = title.trim();
    const parsed = parseItems(items);

    if (!normalizedTitle) {
        throw new Error("List title is required");
    }

    if (parsed.length === 0) {
        throw new Error("No valid items provided");
    }

    return prisma.shuffleList.create({
        data: {
            userId,
            type,
            title: normalizedTitle,
            cards: {
                create: parsed.map((text) => ({
                    text,
                    memorized: false,
                    favorite: false,
                })),
            },
        },
        include: {
            _count: {
                select: { cards: true },
            },
        },
    });
}

export async function getShuffleDashboard(type: ShuffleListType) {
    const userId = await requireUserId();

    const lists = await prisma.shuffleList.findMany({
        where: { userId, type },
        orderBy: { title: "asc" },
        select: {
            id: true,
            title: true,
            type: true,
            createdAt: true,
            updatedAt: true,
            reviewCount: true,
            lastReviewedAt: true,
        },
    });

    if (lists.length === 0) {
        return {
            lists: [],
            totals: {
                lists: 0,
                cards: 0,
                memorized: 0,
                unmemorized: 0,
                favorites: 0,
            },
        };
    }

    const listIds = lists.map((list) => list.id);

    const cards = await prisma.shuffleCard.findMany({
        where: { listId: { in: listIds } },
        select: {
            id: true,
            listId: true,
            memorized: true,
            favorite: true,
        },
    });

    const byList = new Map<
        string,
        { total: number; memorized: number; favorites: number }
    >();

    for (const list of lists) {
        byList.set(list.id, { total: 0, memorized: 0, favorites: 0 });
    }

    for (const card of cards) {
        const entry = byList.get(card.listId);
        if (!entry) continue;

        entry.total += 1;
        if (card.memorized) entry.memorized += 1;
        if (card.favorite) entry.favorites += 1;
    }

    const listWithCounts = lists.map((list) => {
        const counts = byList.get(list.id) ?? {
            total: 0,
            memorized: 0,
            favorites: 0,
        };

        return {
            ...list,
            counts: {
                total: counts.total,
                memorized: counts.memorized,
                unmemorized: counts.total - counts.memorized,
                favorites: counts.favorites,
            },
        };
    });

    const totals = listWithCounts.reduce(
        (acc, list) => {
            acc.cards += list.counts.total;
            acc.memorized += list.counts.memorized;
            acc.unmemorized += list.counts.unmemorized;
            acc.favorites += list.counts.favorites;
            return acc;
        },
        {
            lists: listWithCounts.length,
            cards: 0,
            memorized: 0,
            unmemorized: 0,
            favorites: 0,
        },
    );

    return {
        lists: listWithCounts,
        totals,
    };
}

export async function getShuffleReviewCards(options: {
    type: ShuffleListType;
    listId: string | "all";
    filter?: ShuffleFilter;
    // When present, restricts to exactly these list ids instead of every
    // list of this type ("all") or a single list — re-verified against
    // userId/type here rather than trusted as-is, same as any other
    // ownership check in this file.
    selectedListIds?: string[];
}) {
    const userId = await requireUserId();
    const filter = options.filter ?? "unmemorized";

    let listIds: string[];

    if (options.selectedListIds) {
        const lists = await prisma.shuffleList.findMany({
            where: {
                userId,
                type: options.type,
                id: { in: options.selectedListIds },
            },
            select: { id: true },
        });
        listIds = lists.map((list) => list.id);
    } else if (options.listId === "all") {
        const lists = await prisma.shuffleList.findMany({
            where: { userId, type: options.type },
            select: { id: true },
        });
        listIds = lists.map((list) => list.id);
    } else {
        const list = await prisma.shuffleList.findFirst({
            where: { id: options.listId, userId, type: options.type },
            select: { id: true },
        });

        if (!list) {
            throw new Error("List not found");
        }

        listIds = [list.id];
    }

    if (listIds.length === 0) {
        return {
            listIds,
            cards: [],
        };
    }

    const where = {
        listId: { in: listIds },
        ...(filter === "memorized"
            ? { memorized: true }
            : filter === "unmemorized"
                ? { memorized: false }
                : filter === "favorites"
                    ? { favorite: true }
                    : {}),
    };

    const cards = await prisma.shuffleCard.findMany({
        where,
        include: {
            list: {
                select: {
                    id: true,
                    title: true,
                    type: true,
                },
            },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return {
        listIds,
        cards,
    };
}

export async function getShuffleLists(type?: ShuffleListType) {
    const userId = await requireUserId();

    return prisma.shuffleList.findMany({
        where: {
            userId,
            ...(type ? { type } : {}),
        },
        orderBy: [{ title: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            title: true,
            type: true,
        },
    });
}

export async function getUnmemorizedGroups(type?: ShuffleListType) {
    const userId = await requireUserId();

    const lists = await prisma.shuffleList.findMany({
        where: {
            userId,
            ...(type ? { type } : {}),
        },
        orderBy: [{ title: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            title: true,
            type: true,
            cards: {
                where: { memorized: false },
                select: { id: true },
            },
        },
    });

    const groups = lists
        .map((list) => ({
            listId: list.id,
            title: list.title,
            type: list.type,
            unmemorizedCount: list.cards.length,
        }))
        .filter((group) => group.unmemorizedCount > 0);

    const total = groups.reduce((sum, group) => sum + group.unmemorizedCount, 0);

    return {
        groups,
        totals: {
            groups: groups.length,
            cards: total,
        },
    };
}

export async function getUnmemorizedListDetail(
    listId: string,
    expectedType?: ShuffleListType,
) {
    const userId = await requireUserId();

    const list = await requireOwnedList(userId, listId);

    if (expectedType && list.type !== expectedType) {
        throw new Error("List not found");
    }

    const cards = await prisma.shuffleCard.findMany({
        where: {
            listId,
            memorized: false,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
            id: true,
            listId: true,
            text: true,
            memorized: true,
            favorite: true,
            list: {
                select: {
                    id: true,
                    title: true,
                    type: true,
                },
            },
        },
    });

    return {
        list: {
            id: list.id,
            title: list.title,
            type: list.type,
        },
        cards,
    };
}

export async function toggleShuffleCardMemorized(cardId: string) {
    const userId = await requireUserId();

    const card = await requireOwnedCard(userId, cardId);

    return prisma.shuffleCard.update({
        where: { id: cardId },
        data: { memorized: !card.memorized },
    });
}

export async function toggleShuffleCardFavorite(cardId: string) {
    const userId = await requireUserId();

    const card = await requireOwnedCard(userId, cardId);

    return prisma.shuffleCard.update({
        where: { id: cardId },
        data: { favorite: !card.favorite },
    });
}

export async function updateShuffleCardText(cardId: string, text: string) {
    const userId = await requireUserId();
    const normalized = text.trim();

    if (!normalized) {
        throw new Error("Card text is required");
    }

    await requireOwnedCard(userId, cardId);

    return prisma.shuffleCard.update({
        where: { id: cardId },
        data: { text: normalized },
    });
}

export async function deleteShuffleCard(cardId: string) {
    const userId = await requireUserId();

    await requireOwnedCard(userId, cardId);

    return prisma.shuffleCard.delete({
        where: { id: cardId },
    });
}
