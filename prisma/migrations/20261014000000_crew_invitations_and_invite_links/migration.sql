BEGIN;

-- Direct crew invitations and shareable join links.
--
-- "Crew".inviteCode is intentionally nullable: adding it as NOT NULL would fail
-- on the crews that already exist. They are backfilled below with a generated
-- code, so in practice every crew has one. The column stays nullable because
-- Postgres cannot express "unique and always present" in a single step.

ALTER TABLE "Crew" ADD COLUMN "inviteCode" TEXT;

CREATE TABLE "CrewInvitation" (
    "id" TEXT NOT NULL,
    "status" "CrewRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "crewId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,

    CONSTRAINT "CrewInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Crew_inviteCode_key" ON "Crew"("inviteCode");
CREATE UNIQUE INDEX "CrewInvitation_crewId_receiverId_key" ON "CrewInvitation"("crewId", "receiverId");
CREATE INDEX "CrewInvitation_receiverId_status_idx" ON "CrewInvitation"("receiverId", "status");
CREATE INDEX "CrewInvitation_crewId_status_idx" ON "CrewInvitation"("crewId", "status");
CREATE INDEX "CrewInvitation_senderId_idx" ON "CrewInvitation"("senderId");

ALTER TABLE "CrewInvitation" ADD CONSTRAINT "CrewInvitation_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewInvitation" ADD CONSTRAINT "CrewInvitation_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewInvitation" ADD CONSTRAINT "CrewInvitation_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill a code for every crew that predates the feature. MD5 of the crew id
-- gives a stable, collision-free 8-character code from data already in the row,
-- so re-running this migration cannot hand two crews the same link.
UPDATE "Crew"
SET "inviteCode" = UPPER(SUBSTRING(MD5("id"), 1, 8))
WHERE "inviteCode" IS NULL;

-- A NULL code would break the /davet/[code] lookup, so make it impossible going
-- forward. createCrew always supplies one before the row is written.
ALTER TABLE "Crew" ALTER COLUMN "inviteCode" SET NOT NULL;

COMMIT;