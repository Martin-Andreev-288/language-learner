/*
  Warnings:

  - Added the required column `page` to the `Note` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NotePage" AS ENUM ('reading', 'writing', 'vocabulary', 'listening', 'speaking', 'general');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "page" "NotePage" NOT NULL;

-- CreateTable
CREATE TABLE "NoteFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" "NotePage" NOT NULL,
    "name" TEXT NOT NULL,
    "parentFolderId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteFolder_userId_idx" ON "NoteFolder"("userId");

-- CreateIndex
CREATE INDEX "NoteFolder_userId_page_idx" ON "NoteFolder"("userId", "page");

-- CreateIndex
CREATE INDEX "NoteFolder_parentFolderId_idx" ON "NoteFolder"("parentFolderId");

-- CreateIndex
CREATE INDEX "Note_userId_page_idx" ON "Note"("userId", "page");

-- CreateIndex
CREATE INDEX "Note_folderId_idx" ON "Note"("folderId");

-- AddForeignKey
ALTER TABLE "NoteFolder" ADD CONSTRAINT "NoteFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteFolder" ADD CONSTRAINT "NoteFolder_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "NoteFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "NoteFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
