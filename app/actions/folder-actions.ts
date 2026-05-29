"use server";

import { cookies } from "next/headers";
import { getSSRSession } from "supertokens-node/nextjs";
import { ensureSuperTokensInit } from "@/app/config/backend";
import { prisma } from "@/lib/prisma";

async function requireUserId(): Promise<string> {
    ensureSuperTokensInit();
    const { accessTokenPayload, hasToken } = await getSSRSession((await cookies()).getAll());
    if (!hasToken || !accessTokenPayload) {
        throw new Error("Unauthorized");
    }
    return accessTokenPayload.sub as string;
}

export async function createFolder(name: string) {
    const userId = await requireUserId();

    const maxOrder = await prisma.folder.aggregate({
        where: { userId },
        _max: { order: true },
    });

    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    return prisma.folder.create({
        data: { userId, name, order: nextOrder },
    });
}

export async function getFolders() {
    const userId = await requireUserId();

    return prisma.folder.findMany({
        where: { userId },
        orderBy: { order: "asc" },
    });
}

export async function updateFolder(id: string, name: string) {
    const userId = await requireUserId();

    const folder = await prisma.folder.findFirst({
        where: { id, userId },
    });

    if (!folder) {
        throw new Error("Folder not found");
    }

    return prisma.folder.update({
        where: { id },
        data: { name },
    });
}

export async function deleteFolder(id: string) {
    const userId = await requireUserId();

    const folder = await prisma.folder.findFirst({
        where: { id, userId },
    });

    if (!folder) {
        throw new Error("Folder not found");
    }

    return prisma.folder.delete({
        where: { id },
    });
}

export async function reorderFolders(orderedIds: string[]) {
    const userId = await requireUserId();

    const folders = await prisma.folder.findMany({
        where: { userId },
        select: { id: true },
    });

    const ownedIds = new Set(folders.map((f) => f.id));

    for (const id of orderedIds) {
        if (!ownedIds.has(id)) {
            throw new Error("Folder not found");
        }
    }

    await prisma.$transaction(
        orderedIds.map((id, index) =>
            prisma.folder.update({
                where: { id },
                data: { order: index },
            })
        )
    );
}
