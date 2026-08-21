-- CreateTable
CREATE TABLE "bundles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#DFE104',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flashcardId" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_logs_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "flashcards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_flashcards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT,
    "subjectId" TEXT,
    "bundleId" TEXT,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "nextReview" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReview" DATETIME,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveAgain" INTEGER NOT NULL DEFAULT 0,
    "isLeech" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "flashcards_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "flashcards_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "flashcards_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_flashcards" ("back", "createdAt", "difficulty", "easeFactor", "front", "id", "intervalDays", "lastReview", "nextReview", "reviewCount", "subjectId", "topicId", "updatedAt") SELECT "back", "createdAt", "difficulty", "easeFactor", "front", "id", "intervalDays", "lastReview", "nextReview", "reviewCount", "subjectId", "topicId", "updatedAt" FROM "flashcards";
DROP TABLE "flashcards";
ALTER TABLE "new_flashcards" RENAME TO "flashcards";
CREATE INDEX "flashcards_topicId_idx" ON "flashcards"("topicId");
CREATE INDEX "flashcards_bundleId_idx" ON "flashcards"("bundleId");
CREATE INDEX "flashcards_nextReview_idx" ON "flashcards"("nextReview");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "review_logs_reviewedAt_idx" ON "review_logs"("reviewedAt");

-- CreateIndex
CREATE INDEX "review_logs_flashcardId_idx" ON "review_logs"("flashcardId");
