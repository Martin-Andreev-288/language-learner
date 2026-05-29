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
