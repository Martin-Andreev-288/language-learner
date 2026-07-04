-- DropForeignKey
ALTER TABLE "ShuffleList" DROP CONSTRAINT "ShuffleList_folderId_fkey";

-- AddForeignKey
ALTER TABLE "ShuffleList" ADD CONSTRAINT "ShuffleList_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ShuffleFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
