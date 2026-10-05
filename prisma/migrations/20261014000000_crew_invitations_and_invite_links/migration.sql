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

-- Backfill a code for every crew that predates the feature.
--
-- The code must be drawn from the same 25-character alphabet generateInviteCode()
-- uses in the application, otherwise normalizeInviteCode rejects it and the link is
-- dead on arrival. An earlier version of this migration used UPPER(MD5(id)), whose
-- hex output contains 0, 1, 2, 5, 8 and B -- all outside the invite alphabet. That
-- produced links for existing crews that could never be redeemed; the repair lives
-- in 20261015000000_repair_legacy_invite_codes.
--
-- Deriving each character from a byte of the digest keeps the result stable across
-- re-runs, and the retry on a unique violation means a digest collision cannot
-- hand two crews the same link.
DO $backfill$
DECLARE
  invite_alphabet CONSTANT text := '34679ACDEFGHJKMNPQRTUVWXY';
  crew_row record;
  candidate text;
  salt integer := 0;
BEGIN
  FOR crew_row IN SELECT "id" FROM "Crew" WHERE "inviteCode" IS NULL LOOP
    LOOP
      candidate := (
        SELECT string_agg(
                 substr(invite_alphabet, (get_byte(decode(md5(crew_row."id" || salt::text), 'hex'), position) % length(invite_alphabet)) + 1, 1),
                 '' ORDER BY position)
          FROM generate_series(0, 7) AS position
      );
      BEGIN
        UPDATE "Crew" SET "inviteCode" = candidate WHERE "id" = crew_row."id";
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        salt := salt + 1;
        IF salt > 200 THEN
          RAISE EXCEPTION 'Could not mint a unique invite code for crew %', crew_row."id";
        END IF;
      END;
    END LOOP;
    salt := 0;
  END LOOP;
END
$backfill$;

-- A NULL code would break the /davet/[code] lookup, so make it impossible going
-- forward. createCrew always supplies one before the row is written.
ALTER TABLE "Crew" ALTER COLUMN "inviteCode" SET NOT NULL;

COMMIT;