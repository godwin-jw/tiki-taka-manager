BEGIN;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLAYER', 'CAPTAIN');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DEF', 'MID', 'FWD');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('DRAFT', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Team" AS ENUM ('A', 'B');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'PLAYER';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "reportedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "groupId" DROP NOT NULL;

-- Preserve status and fail atomically on unexpected legacy values.
ALTER TABLE "Match" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Match" ALTER COLUMN "status" TYPE "MatchStatus" USING "status"::"MatchStatus";
ALTER TABLE "Match" ALTER COLUMN "status" SET DEFAULT 'ONGOING';
ALTER TABLE "Match" ALTER COLUMN "updatedAt" DROP DEFAULT;
UPDATE "Match" m SET "createdById" = g."captainId",
  "reportedAt" = CASE WHEN m."status" = 'COMPLETED' THEN m."date" ELSE NULL END
FROM "Group" g WHERE m."groupId" = g."id";
UPDATE "User" SET "role" = 'CAPTAIN'
WHERE "id" IN (SELECT "captainId" FROM "Group");

-- CreateTable
CREATE TABLE "GlobalPlayerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" "Position" NOT NULL DEFAULT 'MID',
    "jerseyNumber" INTEGER,
    "ovrRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "motmCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalPlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerProfileId" TEXT NOT NULL,
    "team" "Team" NOT NULL,
    "position" "Position" NOT NULL,
    "ovrAtMatch" DOUBLE PRECISION NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "isMotm" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalPlayerProfile_userId_key" ON "GlobalPlayerProfile"("userId");

-- CreateIndex
CREATE INDEX "GlobalPlayerProfile_ovrRating_id_idx" ON "GlobalPlayerProfile"("ovrRating" DESC, "id");

-- CreateIndex
CREATE INDEX "GlobalPlayerProfile_goals_id_idx" ON "GlobalPlayerProfile"("goals" DESC, "id");

-- CreateIndex
CREATE INDEX "GlobalPlayerProfile_assists_id_idx" ON "GlobalPlayerProfile"("assists" DESC, "id");

-- CreateIndex
CREATE INDEX "GlobalPlayerProfile_motmCount_id_idx" ON "GlobalPlayerProfile"("motmCount" DESC, "id");

-- CreateIndex
CREATE INDEX "MatchPlayer_playerProfileId_matchId_idx" ON "MatchPlayer"("playerProfileId", "matchId");

-- CreateIndex
CREATE INDEX "MatchPlayer_matchId_team_idx" ON "MatchPlayer"("matchId", "team");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_playerProfileId_key" ON "MatchPlayer"("matchId", "playerProfileId");

-- CreateIndex
CREATE INDEX "Match_status_date_idx" ON "Match"("status", "date" DESC);

-- CreateIndex
CREATE INDEX "Match_groupId_status_idx" ON "Match"("groupId", "status");

-- CreateIndex
CREATE INDEX "Match_createdById_idx" ON "Match"("createdById");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "GlobalPlayerProfile" ADD CONSTRAINT "GlobalPlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "GlobalPlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A user may have multiple legacy profiles: counters are summed, OVR averaged,
-- and the earliest valid primary position wins. Legacy rows remain untouched.
INSERT INTO "GlobalPlayerProfile" (
  "id", "userId", "position", "ovrRating", "goals", "assists",
  "matchesPlayed", "motmCount", "createdAt", "updatedAt"
)
SELECT 'global_' || u."id", u."id",
  COALESCE((SELECT (p."positions"->>'primary')::"Position"
    FROM "PlayerProfile" p WHERE p."userId" = u."id"
    AND p."positions"->>'primary' IN ('GK', 'DEF', 'MID', 'FWD')
    ORDER BY p."createdAt", p."id" LIMIT 1), 'MID'::"Position"),
  COALESCE(s.ovr, 0), COALESCE(s.goals, 0), COALESCE(s.assists, 0),
  COALESCE(s.matches, 0), COALESCE(s.motm, 0), u."createdAt", CURRENT_TIMESTAMP
FROM "User" u LEFT JOIN (
  SELECT "userId", AVG("ovrRating") AS ovr, SUM("goals") AS goals,
    SUM("assists") AS assists, SUM("matchesPlayed") AS matches, SUM("motmCount") AS motm
  FROM "PlayerProfile" GROUP BY "userId"
) s ON s."userId" = u."id";

ALTER TABLE "GlobalPlayerProfile" ADD CONSTRAINT "GlobalPlayerProfile_stats_check"
  CHECK ("ovrRating" >= 0 AND "ovrRating" <= 99 AND "goals" >= 0 AND "assists" >= 0
    AND "matchesPlayed" >= 0 AND "motmCount" >= 0);
ALTER TABLE "GlobalPlayerProfile" ADD CONSTRAINT "GlobalPlayerProfile_jersey_check"
  CHECK ("jerseyNumber" IS NULL OR "jerseyNumber" BETWEEN 1 AND 99);
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_stats_check"
  CHECK ("goals" >= 0 AND "assists" >= 0 AND "ovrAtMatch" BETWEEN 0 AND 99);
-- MOTM is necessarily a participant, and at most one participant may win.
CREATE UNIQUE INDEX "MatchPlayer_one_motm_per_match" ON "MatchPlayer" ("matchId") WHERE "isMotm" = true;

COMMIT;
