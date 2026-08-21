-- CreateTable
CREATE TABLE "card_tags" (
    "cardId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("cardId", "tagId"),
    CONSTRAINT "card_tags_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "flashcards" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "card_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
