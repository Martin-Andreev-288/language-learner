"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShuffleListType } from "@/app/generated/prisma";

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }
    return session.user.id;
}

async function requireOwnedFolder(userId: string, folderId: string) {
    const folder = await prisma.shuffleFolder.findFirst({
        where: { id: folderId, userId },
    });

    if (!folder) {
        throw new Error("Folder not found");
    }

    return folder;
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

// Walks parentFolderId pointers up from `startFolderId` and throws if `targetFolderId`
// is found along the way, which would otherwise create a cycle in the tree.
async function assertNotDescendant(
    userId: string,
    targetFolderId: string,
    startFolderId: string,
) {
    let cursor: string | null = startFolderId;

    while (cursor) {
        if (cursor === targetFolderId) {
            throw new Error("Cannot move a folder into its own subfolder");
        }

        const parent: { parentFolderId: string | null } | null =
            await prisma.shuffleFolder.findFirst({
                where: { id: cursor, userId },
                select: { parentFolderId: true },
            });

        cursor = parent?.parentFolderId ?? null;
    }
}

export async function createShuffleFolder(
    type: ShuffleListType,
    name: string,
    parentFolderId?: string | null,
) {
    const userId = await requireUserId();
    const normalizedName = name.trim();

    if (!normalizedName) {
        throw new Error("Folder name is required");
    }

    if (parentFolderId) {
        await requireOwnedFolder(userId, parentFolderId);
    }

    const maxOrder = await prisma.shuffleFolder.aggregate({
        where: { userId, type, parentFolderId: parentFolderId ?? null },
        _max: { order: true },
    });

    return prisma.shuffleFolder.create({
        data: {
            userId,
            type,
            name: normalizedName,
            parentFolderId: parentFolderId ?? null,
            order: (maxOrder._max.order ?? -1) + 1,
        },
    });
}

export async function renameShuffleFolder(folderId: string, name: string) {
    const userId = await requireUserId();
    const normalizedName = name.trim();

    if (!normalizedName) {
        throw new Error("Folder name is required");
    }

    await requireOwnedFolder(userId, folderId);

    return prisma.shuffleFolder.update({
        where: { id: folderId },
        data: { name: normalizedName },
    });
}

export async function deleteShuffleFolder(folderId: string) {
    const userId = await requireUserId();

    await requireOwnedFolder(userId, folderId);

    // Cascades to child folders, and to every list (and its cards) inside
    // the deleted subtree — deleting a folder deletes everything in it.
    return prisma.shuffleFolder.delete({
        where: { id: folderId },
    });
}

export async function moveShuffleFolder(
    folderId: string,
    newParentFolderId: string | null,
) {
    const userId = await requireUserId();

    const folder = await requireOwnedFolder(userId, folderId);

    if (newParentFolderId === folderId) {
        throw new Error("A folder cannot be moved into itself");
    }

    if (newParentFolderId) {
        await requireOwnedFolder(userId, newParentFolderId);
        await assertNotDescendant(userId, folderId, newParentFolderId);
    }

    const maxOrder = await prisma.shuffleFolder.aggregate({
        where: { userId, type: folder.type, parentFolderId: newParentFolderId },
        _max: { order: true },
    });

    return prisma.shuffleFolder.update({
        where: { id: folderId },
        data: {
            parentFolderId: newParentFolderId,
            order: (maxOrder._max.order ?? -1) + 1,
        },
    });
}

export async function moveShuffleListToFolder(
    listId: string,
    folderId: string | null,
) {
    const userId = await requireUserId();

    await requireOwnedList(userId, listId);

    if (folderId) {
        await requireOwnedFolder(userId, folderId);
    }

    return prisma.shuffleList.update({
        where: { id: listId },
        data: { folderId },
    });
}

export async function reorderShuffleFolders(
    parentFolderId: string | null,
    orderedIds: string[],
) {
    const userId = await requireUserId();

    const siblings = await prisma.shuffleFolder.findMany({
        where: { userId, parentFolderId },
        select: { id: true },
    });

    const ownedIds = new Set(siblings.map((folder) => folder.id));

    for (const id of orderedIds) {
        if (!ownedIds.has(id)) {
            throw new Error("Folder not found");
        }
    }

    await prisma.$transaction(
        orderedIds.map((id, index) =>
            prisma.shuffleFolder.update({
                where: { id },
                data: { order: index },
            }),
        ),
    );
}

// Returns every folder for this user/type as a flat list (folders can be
// arbitrarily deep, so the tree is assembled in-memory rather than through
// a fixed number of nested Prisma `include`s), plus every list with its
// folderId and pre-computed card counts, so the caller can group lists
// under their folder without a second round-trip for dashboard totals.
export async function getShuffleFolderTree(type: ShuffleListType) {
    const userId = await requireUserId();

    const [folders, lists] = await Promise.all([
        prisma.shuffleFolder.findMany({
            where: { userId, type },
            orderBy: [{ order: "asc" }, { name: "asc" }],
            select: {
                id: true,
                name: true,
                parentFolderId: true,
                order: true,
            },
        }),
        prisma.shuffleList.findMany({
            where: { userId, type },
            orderBy: { title: "asc" },
            select: {
                id: true,
                title: true,
                folderId: true,
                reviewCount: true,
                lastReviewedAt: true,
                cards: {
                    select: { memorized: true, favorite: true },
                },
            },
        }),
    ]);

    const listsWithCounts = lists.map((list) => {
        const total = list.cards.length;
        const memorized = list.cards.filter((card) => card.memorized).length;
        const favorites = list.cards.filter((card) => card.favorite).length;

        return {
            id: list.id,
            title: list.title,
            folderId: list.folderId,
            reviewCount: list.reviewCount,
            lastReviewedAt: list.lastReviewedAt,
            counts: {
                total,
                memorized,
                unmemorized: total - memorized,
                favorites,
            },
        };
    });

    const totals = listsWithCounts.reduce(
        (acc, list) => {
            acc.cards += list.counts.total;
            acc.memorized += list.counts.memorized;
            acc.unmemorized += list.counts.unmemorized;
            acc.favorites += list.counts.favorites;
            return acc;
        },
        {
            lists: listsWithCounts.length,
            cards: 0,
            memorized: 0,
            unmemorized: 0,
            favorites: 0,
        },
    );

    return { folders, lists: listsWithCounts, totals };
}
