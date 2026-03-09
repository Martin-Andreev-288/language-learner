"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TextType } from "@/app/generated/prisma";

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }
    return session.user.id;
}

export async function createText(
    folderId: string,
    content: string,
    language: string,
    title?: string,
    type?: TextType
) {
    const userId = await requireUserId();

    const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId },
    });

    if (!folder) {
        throw new Error("Folder not found");
    }

    return prisma.text.create({
        data: {
            userId,
            folderId,
            content,
            language,
            title: title ?? "Untitled",
            type: type ?? "reading",
        },
    });
}

export async function getTextsInFolder(folderId: string) {
    const userId = await requireUserId();

    const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId },
    });

    if (!folder) {
        throw new Error("Folder not found");
    }

    return prisma.text.findMany({
        where: { folderId, userId },
        orderBy: { createdAt: "desc" },
    });
}

export async function updateText(
    id: string,
    data: { title?: string; content?: string }
) {
    const userId = await requireUserId();

    const text = await prisma.text.findFirst({
        where: { id, userId },
    });

    if (!text) {
        throw new Error("Text not found");
    }

    return prisma.text.update({
        where: { id },
        data,
    });
}

export async function deleteText(id: string) {
    const userId = await requireUserId();

    const text = await prisma.text.findFirst({
        where: { id, userId },
    });

    if (!text) {
        throw new Error("Text not found");
    }

    return prisma.text.delete({
        where: { id },
    });
}
