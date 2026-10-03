BEGIN;

-- Data backfill: matches created before custom team names existed have empty
-- strings, which would render as blank headings in the archive. Normalize them
-- to the same defaults the schema and createGlobalMatch use.
UPDATE "Match"
SET "teamAName" = 'A Takımı'
WHERE "teamAName" IS NULL OR btrim("teamAName") = '';

UPDATE "Match"
SET "teamBName" = 'B Takımı'
WHERE "teamBName" IS NULL OR btrim("teamBName") = '';

COMMIT;
