BEGIN;

-- Repair invite codes minted by the previous backfill.
--
-- 20261014000000 backfilled pre-existing crews with UPPER(SUBSTRING(MD5(id),1,8)),
-- which yields hex characters. normalizeInviteCode only accepts the 25-character
-- invite alphabet, so every backfilled code that happened to contain 0, 1, 2, 5, 8
-- or B could never be redeemed: the invite route rejected them as malformed.
--
-- The code is re-derived from the crew id, mapped into the invite alphabet, so the
-- result is deterministic and the migration is safe to re-run. A salt is added and
-- the update retried only if the unique index rejects the candidate, which keeps
-- this correct even for a deliberate hash collision.
DO $repair$
DECLARE
  invite_alphabet CONSTANT text := '34679ACDEFGHJKMNPQRTUVWXY';
  crew_row record;
  candidate text;
  salt integer := 0;
BEGIN
  FOR crew_row IN
    SELECT "id" FROM "Crew"
     WHERE "inviteCode" IS NULL
        OR "inviteCode" !~ ('^[' || invite_alphabet || ']{8}$')
  LOOP
    LOOP
      -- Each byte of the salted digest picks one alphabet character, so all 25
      -- symbols are used evenly rather than favouring the first few.
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
$repair$;

-- Make the alphabet a database invariant instead of an application convention.
-- Any future backfill, seed or manual fix is now rejected at write time rather than
-- producing a shareable link that can never be redeemed.
ALTER TABLE "Crew"
  ADD CONSTRAINT "Crew_inviteCode_alphabet_check"
  CHECK ("inviteCode" ~ '^[34679ACDEFGHJKMNPQRTUVWXY]{8}$');

COMMIT;
