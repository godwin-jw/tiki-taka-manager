BEGIN;

-- Crew stat voting replaces the single-number peer vote.
--
-- Each voter now grades the six attributes for a team-mate inside ONE crew, and
-- the published crew OVR is derived from those numbers instead of stored as a
-- separate value. Additive first, backfill from the old single number (every
-- attribute inherits it, so existing votes keep their meaning), then drop the
-- column: no vote is lost along the way.
ALTER TABLE "PlayerRatingVote" ADD COLUMN "pace" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRatingVote" ADD COLUMN "shooting" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRatingVote" ADD COLUMN "passing" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRatingVote" ADD COLUMN "dribbling" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRatingVote" ADD COLUMN "defending" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRatingVote" ADD COLUMN "physical" INTEGER NOT NULL DEFAULT 0;

UPDATE "PlayerRatingVote" SET
    "pace" = "ovrRating",
    "shooting" = "ovrRating",
    "passing" = "ovrRating",
    "dribbling" = "ovrRating",
    "defending" = "ovrRating",
    "physical" = "ovrRating";

-- Same last line of defence as the old single value: one CHECK per attribute,
-- so even a code path that skips validation cannot store an out-of-range grade.
ALTER TABLE "PlayerRatingVote" ADD CONSTRAINT "PlayerRatingVote_pace_check" CHECK ("pace" >= 0 AND "pace" <= 99);
ALTER TABLE "PlayerRatingVote" ADD CONSTRAINT "PlayerRatingVote_shooting_check" CHECK ("shooting" >= 0 AND "shooting" <= 99);
ALTER TABLE "PlayerRatingVote" ADD CONSTRAINT "PlayerRatingVote_passing_check" CHECK ("passing" >= 0 AND "passing" <= 99);
ALTER TABLE "PlayerRatingVote" ADD CONSTRAINT "PlayerRatingVote_dribbling_check" CHECK ("dribbling" >= 0 AND "dribbling" <= 99);
ALTER TABLE "PlayerRatingVote" ADD CONSTRAINT "PlayerRatingVote_defending_check" CHECK ("defending" >= 0 AND "defending" <= 99);
ALTER TABLE "PlayerRatingVote" ADD CONSTRAINT "PlayerRatingVote_physical_check" CHECK ("physical" >= 0 AND "physical" <= 99);

-- The DEFAULTs existed only to add the columns to a populated table; the Prisma
-- schema declares plain non-null columns, so drop them again to keep both in step.
ALTER TABLE "PlayerRatingVote" ALTER COLUMN "pace" DROP DEFAULT;
ALTER TABLE "PlayerRatingVote" ALTER COLUMN "shooting" DROP DEFAULT;
ALTER TABLE "PlayerRatingVote" ALTER COLUMN "passing" DROP DEFAULT;
ALTER TABLE "PlayerRatingVote" ALTER COLUMN "dribbling" DROP DEFAULT;
ALTER TABLE "PlayerRatingVote" ALTER COLUMN "defending" DROP DEFAULT;
ALTER TABLE "PlayerRatingVote" ALTER COLUMN "physical" DROP DEFAULT;

-- The single-number vote (and its CHECK) is superseded by the six attributes.
ALTER TABLE "PlayerRatingVote" DROP COLUMN "ovrRating";

COMMIT;