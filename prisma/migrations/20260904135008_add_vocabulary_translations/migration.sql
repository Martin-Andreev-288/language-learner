-- CreateTable
CREATE TABLE "VocabularyTranslation" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabularyTranslation_entryId_idx" ON "VocabularyTranslation"("entryId");

-- CreateIndex
CREATE INDEX "VocabularyTranslation_language_idx" ON "VocabularyTranslation"("language");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyTranslation_entryId_language_key" ON "VocabularyTranslation"("entryId", "language");

-- AddForeignKey
ALTER TABLE "VocabularyTranslation" ADD CONSTRAINT "VocabularyTranslation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "VocabularyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
