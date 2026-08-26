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

// `metadata`, when given, is structured data the saving tool needs to
// reopen this note later (Question 266) — kept out of `content` so the note
// stays purely what the user reads and edits. `kind` names the format, so
// the notes list can spot a resumable note without loading the payload.
export async function createNote(
    page: NotePage,
    title: string,
    content: string,
    folderId?: string | null,
    metadata?: { kind: string; data: string },
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
            metadataKind: metadata?.kind ?? null,
            metadata: metadata?.data ?? null,
        },
    });
}

// Updates the given note if it still exists and belongs to this user, and
// creates a fresh one otherwise — returning the id either way, so the caller
// can keep saving to the same note from then on.
//
// Deliberately used only by the chat (Question 265/268), not by the other
// "Save to a new note" buttons. The difference isn't cosmetic: a chat only
// ever grows, so a second save is always the same conversation continued.
// Writing Check and the Listen tools can have their content swapped for
// something completely unrelated between two saves, where quietly
// overwriting the first note would destroy work with no warning.
//
// Doing the existence check here rather than letting an update throw means
// a note deleted from Notes in the meantime falls back to a clean create,
// without the caller having to guess from an error message whether the
// failure was "gone" or "network".
export async function upsertNote(
    noteId: string | null,
    page: NotePage,
    title: string,
    content: string,
    metadata?: { kind: string; data: string },
) {
    const userId = await requireUserId();
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
        throw new Error("Note title is required");
    }

    if (noteId) {
        const existing = await prisma.note.findFirst({
            where: { id: noteId, userId },
            select: { id: true },
        });

        if (existing) {
            // `title` is deliberately not updated here (Question 270): it's
            // only used when creating. Once a note exists, its name is the
            // user's — renaming it in Notes has to survive the next save,
            // and it would be a poor trade to overwrite a name they chose
            // with one derived from a field they may have changed for an
            // unrelated reason.
            return prisma.note.update({
                where: { id: noteId },
                data: {
                    content,
                    metadataKind: metadata?.kind ?? null,
                    metadata: metadata?.data ?? null,
                },
                select: { id: true },
            });
        }
    }

    return prisma.note.create({
        data: {
            userId,
            page,
            title: normalizedTitle,
            content,
            metadataKind: metadata?.kind ?? null,
            metadata: metadata?.data ?? null,
        },
        select: { id: true },
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
