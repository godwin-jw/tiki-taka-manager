BEGIN;

-- CreateTable
CREATE TABLE "PlayerRating" (
    "id" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "playerProfileId" TEXT NOT NULL,
    "pace" INTEGER NOT NULL,
    "shooting" INTEGER NOT NULL,
    "passing" INTEGER NOT NULL,
    "dribbling" INTEGER NOT NULL,
    "defending" INTEGER NOT NULL,
    "physical" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerRating_playerProfileId_idx" ON "PlayerRating"("playerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRating_raterId_playerProfileId_key" ON "PlayerRating"("raterId", "playerProfileId");

-- AddForeignKey
ALTER TABLE "PlayerRating" ADD CONSTRAINT "PlayerRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRating" ADD CONSTRAINT "PlayerRating_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "GlobalPlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerRating" ADD CONSTRAINT "PlayerRating_scores_check" CHECK (
  "pace" BETWEEN 0 AND 99 AND "shooting" BETWEEN 0 AND 99 AND
  "passing" BETWEEN 0 AND 99 AND "dribbling" BETWEEN 0 AND 99 AND
  "defending" BETWEEN 0 AND 99 AND "physical" BETWEEN 0 AND 99
);

COMMIT;
