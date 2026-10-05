BEGIN;

-- Peer-to-peer OVR voting, scoped to a single crew.
--
-- The CHECK constraint is the last line of defence: even if a code path ever
-- skips validation, a row outside 0-99 cannot be stored, which would otherwise
-- silently skew every published average.
CREATE TABLE "PlayerRatingVote" (
    "id" TEXT NOT NULL,
    "ovrRating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "crewId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,

    CONSTRAINT "PlayerRatingVote_ovrRating_check" CHECK ("ovrRating" >= 0 AND "ovrRating" <= 99),

    CONSTRAINT "PlayerRatingVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerRatingVote_crewId_voterId_targetUserId_key" ON "PlayerRatingVote"("crewId", "voterId", "targetUserId");
CREATE INDEX "PlayerRatingVote_targetUserId_idx" ON "PlayerRatingVote"("targetUserId");
CREATE INDEX "PlayerRatingVote_crewId_idx" ON "PlayerRatingVote"("crewId");

ALTER TABLE "PlayerRatingVote" ADD CONSTRAINT "PlayerRatingVote_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerRatingVote" ADD CONSTRAINT "PlayerRatingVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerRatingVote" ADD CONSTRAINT "PlayerRatingVote_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data scoping: matches were never attributed to a crew, so every crew dashboard
-- inherited the whole global archive. Matches created before this point belong to
-- no crew; NULL is therefore the correct value and no rewrite is applied.
--
-- No new index is needed: "Match_crewId_date_idx" (crewId, date DESC), added
-- together with the column, already serves the crew archive ordering.

COMMIT;