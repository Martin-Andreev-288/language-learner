"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }
    return session.user.id;
}

export async function getSystemDialogues() {
    return prisma.systemDialogue.findMany({
        orderBy: { order: "asc" },
    });
}

export async function copyDialogueToPersonal(
    systemDialogueId: string,
    folderId?: string
) {
    const userId = await requireUserId();

    const dialogue = await prisma.systemDialogue.findUnique({
        where: { id: systemDialogueId },
    });

    if (!dialogue) {
        throw new Error("Dialogue not found");
    }

    let targetFolderId = folderId;

    if (!targetFolderId) {
        let myDialogues = await prisma.folder.findFirst({
            where: { userId, name: "My Dialogues" },
        });

        if (!myDialogues) {
            const maxOrder = await prisma.folder.aggregate({
                where: { userId },
                _max: { order: true },
            });

            myDialogues = await prisma.folder.create({
                data: {
                    userId,
                    name: "My Dialogues",
                    order: (maxOrder._max.order ?? -1) + 1,
                },
            });
        }

        targetFolderId = myDialogues.id;
    } else {
        const folder = await prisma.folder.findFirst({
            where: { id: targetFolderId, userId },
        });

        if (!folder) {
            throw new Error("Folder not found");
        }
    }

    return prisma.text.create({
        data: {
            userId,
            folderId: targetFolderId,
            title: dialogue.title,
            content: dialogue.content,
            language: dialogue.language,
            type: "dialogue",
        },
    });
}
