BEGIN;

-- CreateEnum
CREATE TYPE "CrewRole" AS ENUM ('OWNER', 'CAPTAIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CrewRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Crew" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" TEXT NOT NULL,
    "role" "CrewRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewRequest" (
    "id" TEXT NOT NULL,
    "status" "CrewRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "crewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CrewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSeasonStat" (
    "id" TEXT NOT NULL,
    "ovrRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "motmCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "seasonId" TEXT NOT NULL,
    "playerProfileId" TEXT NOT NULL,

    CONSTRAINT "PlayerSeasonStat_pkey" PRIMARY KEY ("id")
);

-- AlterTable: existing matches keep the default team names.
ALTER TABLE "Match" ADD COLUMN "teamAName" TEXT NOT NULL DEFAULT 'A Takımı';
ALTER TABLE "Match" ADD COLUMN "teamBName" TEXT NOT NULL DEFAULT 'B Takımı';
ALTER TABLE "Match" ADD COLUMN "crewId" TEXT;
ALTER TABLE "Match" ADD COLUMN "seasonId" TEXT;

-- CreateIndex
CREATE INDEX "Crew_name_idx" ON "Crew"("name");
CREATE UNIQUE INDEX "CrewMember_crewId_userId_key" ON "CrewMember"("crewId", "userId");
CREATE INDEX "CrewMember_userId_idx" ON "CrewMember"("userId");
CREATE UNIQUE INDEX "CrewRequest_crewId_userId_key" ON "CrewRequest"("crewId", "userId");
CREATE INDEX "CrewRequest_crewId_status_idx" ON "CrewRequest"("crewId", "status");
CREATE INDEX "CrewRequest_userId_status_idx" ON "CrewRequest"("userId", "status");
CREATE UNIQUE INDEX "Season_name_key" ON "Season"("name");
CREATE INDEX "Season_isActive_idx" ON "Season"("isActive");
CREATE UNIQUE INDEX "PlayerSeasonStat_seasonId_playerProfileId_key" ON "PlayerSeasonStat"("seasonId", "playerProfileId");
CREATE INDEX "PlayerSeasonStat_playerProfileId_idx" ON "PlayerSeasonStat"("playerProfileId");
CREATE INDEX "PlayerSeasonStat_seasonId_goals_idx" ON "PlayerSeasonStat"("seasonId", "goals" DESC);
CREATE INDEX "PlayerSeasonStat_seasonId_assists_idx" ON "PlayerSeasonStat"("seasonId", "assists" DESC);
CREATE INDEX "PlayerSeasonStat_seasonId_motmCount_idx" ON "PlayerSeasonStat"("seasonId", "motmCount" DESC);
CREATE INDEX "PlayerSeasonStat_seasonId_ovrRating_idx" ON "PlayerSeasonStat"("seasonId", "ovrRating" DESC);
CREATE INDEX "Match_crewId_date_idx" ON "Match"("crewId", "date" DESC);
CREATE INDEX "Match_seasonId_status_idx" ON "Match"("seasonId", "status");

-- At most one season may be active at a time.
CREATE UNIQUE INDEX "Season_single_active_key" ON "Season" ("isActive") WHERE "isActive" = true;

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlayerSeasonStat" ADD CONSTRAINT "PlayerSeasonStat_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerSeasonStat" ADD CONSTRAINT "PlayerSeasonStat_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "GlobalPlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Statistics can never be negative.
ALTER TABLE "PlayerSeasonStat" ADD CONSTRAINT "PlayerSeasonStat_non_negative_check" CHECK (
  "goals" >= 0 AND "assists" >= 0 AND "matchesPlayed" >= 0 AND "motmCount" >= 0
);

ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_status_timestamp_check" CHECK (
  ("status" = 'PENDING' AND "resolvedAt" IS NULL AND "reviewedById" IS NULL)
  OR ("status" <> 'PENDING' AND "resolvedAt" IS NOT NULL)
);

COMMIT;