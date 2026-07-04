-- AlterTable
ALTER TABLE "ShuffleList" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "ShuffleFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ShuffleListType" NOT NULL,
    "name" TEXT NOT NULL,
    "parentFolderId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShuffleFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShuffleFolder_userId_idx" ON "ShuffleFolder"("userId");

-- CreateIndex
CREATE INDEX "ShuffleFolder_userId_type_idx" ON "ShuffleFolder"("userId", "type");

-- CreateIndex
CREATE INDEX "ShuffleFolder_parentFolderId_idx" ON "ShuffleFolder"("parentFolderId");

-- CreateIndex
CREATE INDEX "ShuffleList_folderId_idx" ON "ShuffleList"("folderId");

-- AddForeignKey
ALTER TABLE "ShuffleFolder" ADD CONSTRAINT "ShuffleFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuffleFolder" ADD CONSTRAINT "ShuffleFolder_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "ShuffleFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuffleList" ADD CONSTRAINT "ShuffleList_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ShuffleFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
