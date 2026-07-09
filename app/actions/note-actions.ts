"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NotePage } from "@/app/generated/prisma";

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }
    return session.user.id;
}

async function requireOwnedNote(userId: string, noteId: string) {
    const note = await prisma.note.findFirst({
        where: { id: noteId, userId },
    });

    if (!note) {
        throw new Error("Note not found");
    }

    return note;
}

export async function createNote(
    page: NotePage,
    title: string,
    content: string,
    folderId?: string | null,
) {
    const userId = await requireUserId();
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
        throw new Error("Note title is required");
    }

    if (folderId) {
        const folder = await prisma.noteFolder.findFirst({
            where: { id: folderId, userId },
        });

        if (!folder) {
            throw new Error("Folder not found");
        }
    }

    return prisma.note.create({
        data: {
            userId,
            page,
            title: normalizedTitle,
            content,
            folderId: folderId ?? null,
        },
    });
}

export async function getNote(noteId: string) {
    const userId = await requireUserId();
    return requireOwnedNote(userId, noteId);
}

export async function renameNote(noteId: string, title: string) {
    const userId = await requireUserId();
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
        throw new Error("Note title is required");
    }

    await requireOwnedNote(userId, noteId);

    return prisma.note.update({
        where: { id: noteId },
        data: { title: normalizedTitle },
    });
}

export async function updateNoteContent(noteId: string, content: string) {
    const userId = await requireUserId();

    await requireOwnedNote(userId, noteId);

    return prisma.note.update({
        where: { id: noteId },
        data: { content },
    });
}

export async function deleteNote(noteId: string) {
    const userId = await requireUserId();

    await requireOwnedNote(userId, noteId);

    return prisma.note.delete({
        where: { id: noteId },
    });
}
