"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MAX_WORDS = 100;

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }
    return session.user.id;
}

// One word per line — same convention Vocab Shuffle's bulk-add already
// uses, so pasting a list here behaves the way it does everywhere else in
// this app.
function parseWords(input: string): string[] {
    return input
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

// Adds one or more words (newline-separated) to the user's vocabulary, all
// under the same language. Already-saved word/language pairs are silently
// skipped rather than duplicated or erroring — this is a manual, deliberate
// add (from this page, or later from Inline Translate's marked words /
// right-click popup), not a "seen while reading/writing" event, so
// timesSeenReading/timesSeenWriting are left alone here — they default to 0
// via the schema itself. A single word is just the one-line case of this,
// so there's no separate single-word function to keep in sync with this one.
export async function addVocabularyEntries(words: string, language: string) {
    const userId = await requireUserId();
    const normalizedLanguage = language.trim();

    if (!normalizedLanguage) {
        throw new Error("Enter a language for these words.");
    }

    const parsedWords = Array.from(new Set(parseWords(words)));
    if (parsedWords.length === 0) {
        throw new Error("There's nothing to add — enter at least one word.");
    }
    if (parsedWords.length > MAX_WORDS) {
        throw new Error(
            `That's ${parsedWords.length} words — please add ${MAX_WORDS} or fewer at a time.`,
        );
    }

    const result = await prisma.vocabularyEntry.createMany({
        data: parsedWords.map((word) => ({
            userId,
            word,
            language: normalizedLanguage,
        })),
        skipDuplicates: true,
    });

    return { added: result.count, skipped: parsedWords.length - result.count };
}

export async function getVocabularyEntries() {
    const userId = await requireUserId();
    return prisma.vocabularyEntry.findMany({
        where: { userId },
        orderBy: { firstSeen: "desc" },
    });
}

export async function deleteVocabularyEntry(id: string) {
    const userId = await requireUserId();

    const entry = await prisma.vocabularyEntry.findFirst({
        where: { id, userId },
    });
    if (!entry) {
        throw new Error("Vocabulary entry not found");
    }

    return prisma.vocabularyEntry.delete({ where: { id } });
}
