-- Create enum for shuffle list type
CREATE TYPE "ShuffleListType" AS ENUM ('word', 'phrase');

-- Create shuffle lists table
CREATE TABLE "ShuffleList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ShuffleListType" NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShuffleList_pkey" PRIMARY KEY ("id")
);

-- Create shuffle cards table
CREATE TABLE "ShuffleCard" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "memorized" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShuffleCard_pkey" PRIMARY KEY ("id")
);

-- Indexes for ShuffleList
CREATE INDEX "ShuffleList_userId_idx" ON "ShuffleList"("userId");
CREATE INDEX "ShuffleList_userId_type_idx" ON "ShuffleList"("userId", "type");
CREATE INDEX "ShuffleList_createdAt_idx" ON "ShuffleList"("createdAt");

-- Indexes for ShuffleCard
CREATE INDEX "ShuffleCard_listId_idx" ON "ShuffleCard"("listId");
CREATE INDEX "ShuffleCard_memorized_idx" ON "ShuffleCard"("memorized");
CREATE INDEX "ShuffleCard_favorite_idx" ON "ShuffleCard"("favorite");
CREATE INDEX "ShuffleCard_createdAt_idx" ON "ShuffleCard"("createdAt");

-- Foreign keys
ALTER TABLE "ShuffleList"
ADD CONSTRAINT "ShuffleList_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShuffleCard"
ADD CONSTRAINT "ShuffleCard_listId_fkey"
FOREIGN KEY ("listId") REFERENCES "ShuffleList"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
