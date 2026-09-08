"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatError } from "@/lib/utils";
import {
    ENRICHMENT_DETAIL_FIELDS,
    PER_LANGUAGE_FIELDS,
} from "@/lib/vocabulary-enrichment";

// One translation as the edit form sends it: the language it's in, the
// word in that language, and whichever of its own generated fields were
// edited alongside (Question 335). The fields are a loose record for the
// same reason the entry's `enrichment` is — the form sends what it has,
// and the list of what that can be lives in one place, not two.
type TranslationInput = {
    language: string;
    text: string;
    enrichment?: Partial<Record<string, string>>;
};

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
// words, and so on. Omit it, or leave a line blank, for a word with no
// translation to record.
//
// `translationLanguage` is what changed in Question 333, and it's the whole
// point of the step: a translation now has to say which language it's in,
// because it becomes a VocabularyTranslation row rather than an anonymous
// column. Callers always knew this — Inline Translate has just finished
// translating *into* a language by the time it calls here — the old
// signature simply never asked for it (Question 214), and that missing
// answer is what made the column impossible to migrate later.
export async function addVocabularyEntries(
    words: string,
    language: string,
    translations?: string,
    translationLanguage?: string,
) {
    const userId = await requireUserId();
    const normalizedLanguage = language.trim();

    if (!normalizedLanguage) {
        throw new Error("Enter a language for these words.");
    }

    const wordLines = words.split("\n").map((line) => line.trim());
    const translationLines = (translations ?? "").split("\n");
    const targetLanguage = translationLanguage?.trim() ?? "";

    // Keyed by word so a word repeated across lines still becomes one row,
    // same as before — a Map here (instead of a plain Set of words) is what
    // lets a translation ride along with the dedup rather than needing a
    // separate pass that could drift out of alignment with it.
    const byWord = new Map<string, string | undefined>();
    wordLines.forEach((word, index) => {
        if (!word) return;
        const translation = targetLanguage
            ? translationLines[index]?.trim()
            : undefined;
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
        data: parsedEntries.map(([word]) => ({
            userId,
            word,
            language: normalizedLanguage,
        })),
        skipDuplicates: true,
    });

    // Translations are written in a second pass, because createMany returns
    // a count rather than the rows it made and a translation needs its
    // entry's id. The ids are read back by word instead, which quietly buys
    // something the old column never did: a word you'd already saved still
    // gets the translation recorded, rather than having it dropped along
    // with the duplicate word it arrived with.
    const withTranslations = parsedEntries.filter(([, text]) => text);
    if (targetLanguage && withTranslations.length > 0) {
        const saved = await prisma.vocabularyEntry.findMany({
            where: {
                userId,
                language: normalizedLanguage,
                word: { in: withTranslations.map(([word]) => word) },
            },
            select: { id: true, word: true },
        });
        const idByWord = new Map(saved.map((entry) => [entry.word, entry.id]));

        await prisma.vocabularyTranslation.createMany({
            data: withTranslations.flatMap(([word, text]) => {
                const entryId = idByWord.get(word);
                return entryId
                    ? [{ entryId, language: targetLanguage, text: text! }]
                    : [];
            }),
            // Same fill-in-only rule enrichment follows: a translation you
            // already have in that language is never replaced by one
            // arriving from somewhere else.
            skipDuplicates: true,
        });
    }

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
        // Loaded with the entries rather than fetched per word when a row
        // is expanded (Question 326): it's one extra query for the whole
        // page against a table with at most a handful of rows per word,
        // where the alternative is a request every time a word is opened.
        // Ordered by language so the same word always lists its
        // translations in the same order, whichever order they were added.
        include: {
            // Everything a translation carries, not just its text — since
            // Question 335 a translation holds its own level, gender,
            // synonyms and the rest, and the Details panel shows them
            // grouped by language.
            translations: {
                omit: { entryId: true, createdAt: true, updatedAt: true },
                orderBy: { language: "asc" },
            },
        },
    });
}

// Word and language are directly editable — same principle as Vocab
// Shuffle's own edit. Translations are edited through `translations` below
// rather than as a field here, since Question 333 removed the single
// language-less one they used to sit beside. Changing word or language into a
// combination you already have saved would collide with the unique
// constraint; formatError turns that into a plain "already exists" message
// instead of a raw database error reaching the page.
export async function updateVocabularyEntry(
    id: string,
    updates: {
        word: string;
        language: string;
        // Any generated field the caller chose to send. Omitting one leaves
        // it untouched; sending it empty clears it — which is what makes
        // "delete this piece of information" need no separate action of its
        // own (Question 250). Deliberately not run through
        // sanitizeGeneratedText: that exists to repair model output, and
        // text a person typed on purpose is theirs to keep as written.
        enrichment?: Partial<Record<string, string>>;
        // The word's per-language translations, in full (Question 327).
        // Omitting the key leaves them untouched; sending the list replaces
        // it, so a language dropped from the list is a language deleted.
        //
        // Replace-all rather than a set of add/edit/delete actions because
        // that's what the edit form actually produces: it opens holding
        // every translation the word has and saves whatever is left in it,
        // exactly like the enrichment fields beside it. Three narrower
        // actions would each need their own error handling and their own
        // refresh, for a form that already knows the whole answer.
        // Each carries its own generated fields too since Question 335 —
        // a translation is a word in a language, so it is edited the same
        // way the source word is, field for field.
        translations?: TranslationInput[];
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

    if (!word) {
        throw new Error("Word can't be empty.");
    }
    if (!language) {
        throw new Error("Language can't be empty.");
    }

    const data: Record<string, string | null> = {
        word,
        language,
    };

    for (const field of ENRICHMENT_DETAIL_FIELDS) {
        const value = updates.enrichment?.[field];
        if (value === undefined) continue;
        data[field] = value.trim() || null;
    }

    try {
        const updated = await prisma.vocabularyEntry.update({
            where: { id },
            data,
        });

        if (updates.translations) {
            await saveTranslations(id, updates.translations);
        }

        return updated;
    } catch (error) {
        throw new Error(formatError(error));
    }
}

// Writes a word's translations to match the list given, and nothing else.
//
// Deletes first, then upserts what's left, in one transaction: the two
// halves are one edit, and a failure between them would leave the word
// holding neither the old set nor the new one. The unique constraint on
// [entryId, language] is what makes upsert the right verb here — renaming
// a translation's language is a delete plus an insert, not an update, and
// doing it in this order means the freed name is available again by the
// time the insert wants it.
async function saveTranslations(
    entryId: string,
    translations: TranslationInput[],
) {
    // Blank rows are how the form says "I removed this one", and a language
    // with no text is nothing to store. Deduplicated by language for the
    // same reason the enrichment action does it: one row per language is
    // the constraint, so two of the same in the form is a collision rather
    // than two translations.
    // A Map, and later wins: the form sends its half-typed "add one" row
    // last, so someone who retypes a language they already have is
    // correcting it rather than repeating it. Re-setting a key keeps the
    // row in its original position with the new text, which is also why
    // this isn't a filter over a Set.
    const byLanguage = new Map<
        string,
        { language: string; text: string; fields: Record<string, string | null> }
    >();
    for (const { language, text, enrichment } of translations) {
        const trimmedLanguage = language.trim();
        const trimmedText = text.trim();
        if (!trimmedLanguage || !trimmedText) continue;

        // Same rule the entry's own fields follow: a key that isn't sent is
        // left alone, and one sent empty clears the field. That's what lets
        // "delete this piece of information" need no action of its own.
        const fields: Record<string, string | null> = {};
        for (const field of PER_LANGUAGE_FIELDS) {
            const value = enrichment?.[field];
            if (value === undefined) continue;
            fields[field] = value.trim() || null;
        }

        byLanguage.set(trimmedLanguage.toLowerCase(), {
            language: trimmedLanguage,
            text: trimmedText,
            fields,
        });
    }
    const cleaned = Array.from(byLanguage.values());

    await prisma.$transaction([
        prisma.vocabularyTranslation.deleteMany({
            where: {
                entryId,
                language: { notIn: cleaned.map((item) => item.language) },
            },
        }),
        ...cleaned.map(({ language, text, fields }) =>
            prisma.vocabularyTranslation.upsert({
                where: { entryId_language: { entryId, language } },
                create: { entryId, language, text, ...fields },
                update: { text, ...fields },
            }),
        ),
    ]);
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
