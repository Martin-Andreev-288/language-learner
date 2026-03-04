/*
  Warnings:

  - A unique constraint covering the columns `[language,category,title]` on the table `SystemDialogue` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category` to the `SystemDialogue` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SystemDialogue" ADD COLUMN     "category" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "SystemDialogue_category_idx" ON "SystemDialogue"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SystemDialogue_language_category_title_key" ON "SystemDialogue"("language", "category", "title");
