"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatError } from "@/lib/utils";
import { ENRICHMENT_DETAIL_FIELDS } from "@/lib/vocabulary-enrichment";

const MAX_WORDS = 100;

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }
    return session.user.id;
}

// Adds one or more words (newline-separated) to the user's vocabulary, all
// under the same language — one word per line, same convention Vocab
// Shuffle's bulk-add already uses. Already-saved word/language pairs are
// silently skipped rather than duplicated or erroring — this is a manual,
// deliberate add (from this page, or from Inline Translate's marked words /
// right-click popup), not a "seen while reading/writing" event, so
// timesSeenReading/timesSeenWriting are left alone here — they default to 0
// via the schema itself. A single word is just the one-line case of this,
// so there's no separate single-word function to keep in sync with this one.
//
// `translations`, if given, is the same one-per-line shape as `words`,
// paired by line position — line 1 of translations goes with line 1 of
// words, and so on. Entirely optional and deliberately not tied to a
// tracked "translation language" of its own, per Question 214 — just
// whatever translation the caller already had on hand (Inline Translate
// always does, by the time it calls this). Omit it, or leave a line blank,
// for a word with no translation to record.
export async function addVocabularyEntries(
    words: string,
    language: string,
    translations?: string,
) {
    const userId = await requireUserId();
    const normalizedLanguage = language.trim();

    if (!normalizedLanguage) {
        throw new Error("Enter a language for these words.");
    }

    const wordLines = words.split("\n").map((line) => line.trim());
    const translationLines = (translations ?? "").split("\n");

    // Keyed by word so a word repeated across lines still becomes one row,
    // same as before — a Map here (instead of a plain Set of words) is what
    // lets a translation ride along with the dedup rather than needing a
    // separate pass that could drift out of alignment with it.
    const byWord = new Map<string, string | undefined>();
    wordLines.forEach((word, index) => {
        if (!word) return;
        const translation = translationLines[index]?.trim();
        byWord.set(word, translation || undefined);
    });

    const parsedEntries = Array.from(byWord.entries());
    if (parsedEntries.length === 0) {
        throw new Error("There's nothing to add — enter at least one word.");
    }
    if (parsedEntries.length > MAX_WORDS) {
        throw new Error(
            `That's ${parsedEntries.length} words — please add ${MAX_WORDS} or fewer at a time.`,
        );
    }

    const result = await prisma.vocabularyEntry.createMany({
        data: parsedEntries.map(([word, translation]) => ({
            userId,
            word,
            translation: translation ?? null,
            language: normalizedLanguage,
        })),
        skipDuplicates: true,
    });

    return {
        added: result.count,
        skipped: parsedEntries.length - result.count,
    };
}

export async function getVocabularyEntries() {
    const userId = await requireUserId();
    return prisma.vocabularyEntry.findMany({
        where: { userId },
        orderBy: { firstSeen: "desc" },
    });
}

// Word, translation, and language are all directly editable — same
// principle as Vocab Shuffle's own edit. Changing word or language into a
// combination you already have saved would collide with the unique
// constraint; formatError turns that into a plain "already exists" message
// instead of a raw database error reaching the page.
export async function updateVocabularyEntry(
    id: string,
    updates: {
        word: string;
        translation: string;
        language: string;
        // Any generated field the caller chose to send. Omitting one leaves
        // it untouched; sending it empty clears it — which is what makes
        // "delete this piece of information" need no separate action of its
        // own (Question 250). Deliberately not run through
        // sanitizeGeneratedText: that exists to repair model output, and
        // text a person typed on purpose is theirs to keep as written.
        enrichment?: Partial<Record<string, string>>;
    },
) {
    const userId = await requireUserId();

    const entry = await prisma.vocabularyEntry.findFirst({
        where: { id, userId },
    });
    if (!entry) {
        throw new Error("Vocabulary entry not found");
    }

    const word = updates.word.trim();
    const language = updates.language.trim();
    const translation = updates.translation.trim();

    if (!word) {
        throw new Error("Word can't be empty.");
    }
    if (!language) {
        throw new Error("Language can't be empty.");
    }

    const data: Record<string, string | null> = {
        word,
        language,
        translation: translation || null,
    };

    for (const field of ENRICHMENT_DETAIL_FIELDS) {
        const value = updates.enrichment?.[field];
        if (value === undefined) continue;
        data[field] = value.trim() || null;
    }

    try {
        return await prisma.vocabularyEntry.update({
            where: { id },
            data,
        });
    } catch (error) {
        throw new Error(formatError(error));
    }
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
