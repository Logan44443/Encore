ALTER TABLE "title_entries" ADD COLUMN "user_score" real;--> statement-breakpoint
-- Rescore existing lists with scoreList() from @encore/shared (no set scores yet): titles spread evenly inside the tier, so a lone title is mid-tier.
UPDATE "title_entries" AS e
SET "score" = ROUND(r.hi - (r.hi - r.lo) * (s.idx + 1) / (s.n + 1), 1)
FROM (
  SELECT "id", "tier",
    ROW_NUMBER() OVER (PARTITION BY "user_id", "media_type", "genre_id", "tier" ORDER BY "position") - 1 AS idx,
    COUNT(*) OVER (PARTITION BY "user_id", "media_type", "genre_id", "tier") AS n
  FROM "title_entries"
) AS s
JOIN (VALUES ('liked', 6.8, 10.0), ('fine', 3.5, 6.7), ('disliked', 0.0, 3.4)) AS r(tier, lo, hi) ON r.tier = s.tier::text
WHERE e."id" = s."id";
--> statement-breakpoint
UPDATE "season_entries" AS e
SET "score" = ROUND(r.hi - (r.hi - r.lo) * (s.idx + 1) / (s.n + 1), 1)
FROM (
  SELECT "id", "tier",
    ROW_NUMBER() OVER (PARTITION BY "user_id", "title_id", "tier" ORDER BY "position") - 1 AS idx,
    COUNT(*) OVER (PARTITION BY "user_id", "title_id", "tier") AS n
  FROM "season_entries"
) AS s
JOIN (VALUES ('liked', 6.8, 10.0), ('fine', 3.5, 6.7), ('disliked', 0.0, 3.4)) AS r(tier, lo, hi) ON r.tier = s.tier::text
WHERE e."id" = s."id";
