"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NotePage } from "@/app/generated/prisma";

const PREVIEW_LENGTH = 140;

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }
    return session.user.id;
}

async function requireOwnedFolder(userId: string, folderId: string) {
    const folder = await prisma.noteFolder.findFirst({
        where: { id: folderId, userId },
    });

    if (!folder) {
        throw new Error("Folder not found");
    }

    return folder;
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
            await prisma.noteFolder.findFirst({
                where: { id: cursor, userId },
                select: { parentFolderId: true },
            });

        cursor = parent?.parentFolderId ?? null;
    }
}

export async function createNoteFolder(
    page: NotePage,
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

    const maxOrder = await prisma.noteFolder.aggregate({
        where: { userId, page, parentFolderId: parentFolderId ?? null },
        _max: { order: true },
    });

    return prisma.noteFolder.create({
        data: {
            userId,
            page,
            name: normalizedName,
            parentFolderId: parentFolderId ?? null,
            order: (maxOrder._max.order ?? -1) + 1,
        },
    });
}

export async function renameNoteFolder(folderId: string, name: string) {
    const userId = await requireUserId();
    const normalizedName = name.trim();

    if (!normalizedName) {
        throw new Error("Folder name is required");
    }

    await requireOwnedFolder(userId, folderId);

    return prisma.noteFolder.update({
        where: { id: folderId },
        data: { name: normalizedName },
    });
}

export async function deleteNoteFolder(folderId: string) {
    const userId = await requireUserId();

    await requireOwnedFolder(userId, folderId);

    // Cascades to child folders, and to every note inside the deleted
    // subtree — deleting a folder deletes everything in it.
    return prisma.noteFolder.delete({
        where: { id: folderId },
    });
}

export async function moveNoteFolder(
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

    const maxOrder = await prisma.noteFolder.aggregate({
        where: { userId, page: folder.page, parentFolderId: newParentFolderId },
        _max: { order: true },
    });

    return prisma.noteFolder.update({
        where: { id: folderId },
        data: {
            parentFolderId: newParentFolderId,
            order: (maxOrder._max.order ?? -1) + 1,
        },
    });
}

export async function moveNoteToFolder(
    noteId: string,
    folderId: string | null,
) {
    const userId = await requireUserId();

    await requireOwnedNote(userId, noteId);

    if (folderId) {
        await requireOwnedFolder(userId, folderId);
    }

    return prisma.note.update({
        where: { id: noteId },
        data: { folderId },
    });
}

export async function reorderNoteFolders(
    parentFolderId: string | null,
    orderedIds: string[],
) {
    const userId = await requireUserId();

    const siblings = await prisma.noteFolder.findMany({
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
            prisma.noteFolder.update({
                where: { id },
                data: { order: index },
            }),
        ),
    );
}

// Returns every folder for this user/page as a flat list (folders can be
// arbitrarily deep, so the tree is assembled in-memory rather than through
// a fixed number of nested Prisma `include`s), plus every note with its
// folderId and a short content preview instead of the full body.
export async function getNoteFolderTree(page: NotePage) {
    const userId = await requireUserId();

    const [folders, notes] = await Promise.all([
        prisma.noteFolder.findMany({
            where: { userId, page },
            orderBy: [{ order: "asc" }, { name: "asc" }],
            select: {
                id: true,
                name: true,
                parentFolderId: true,
                order: true,
            },
        }),
        prisma.note.findMany({
            where: { userId, page },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                title: true,
                content: true,
                folderId: true,
                createdAt: true,
                updatedAt: true,
                // Only the kind, never the payload: a saved conversation's
                // metadata can be large, and the list just needs to know
                // whether a note is resumable, not what's in it.
                metadataKind: true,
            },
        }),
    ]);

    const notesWithPreview = notes.map((note) => ({
        id: note.id,
        title: note.title,
        folderId: note.folderId,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        metadataKind: note.metadataKind,
        preview:
            note.content.length > PREVIEW_LENGTH
                ? `${note.content.slice(0, PREVIEW_LENGTH)}…`
                : note.content,
    }));

    return { folders, notes: notesWithPreview };
}
