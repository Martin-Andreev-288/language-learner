-- Renames rather than dropping and re-adding, so whatever is already in
-- the column survives the change. Prisma's own generator would have
-- written a DROP plus an ADD here, which is the same shape of migration
-- and quietly loses every value in it.
ALTER TABLE "VocabularyEntry" RENAME COLUMN "worthLearning" TO "usedIn";
