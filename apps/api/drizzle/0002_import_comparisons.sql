ALTER TABLE "title_entries" ADD COLUMN "import_stars" real;--> statement-breakpoint
ALTER TABLE "title_entries" ADD COLUMN "compare_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Imports used to pin each film or book at its stars × 2, so every 5★ film sat at exactly 10 and
-- never moved. Turn those back into titles scored by their place in the list, keeping their stars
-- and marking them to be compared. An imported score was always a whole number, and only users who
-- have imported from that site have any.
UPDATE "title_entries" AS e
SET "import_stars" = e."user_score" / 2, "user_score" = NULL, "compare_pending" = true
WHERE e."media_type" IN ('movie', 'book')
  AND e."user_score" >= 1 AND e."user_score" = round(e."user_score")
  AND EXISTS (
    SELECT 1 FROM "catalog_imports" AS i
    WHERE i."user_id" = e."user_id"
      AND i."source" = (CASE e."media_type" WHEN 'movie' THEN 'letterboxd' ELSE 'goodreads' END)::"import_source"
      AND e."created_at" <= coalesce(i."finished_at", now())
  );--> statement-breakpoint
-- Lists whose scores the API recomputes (with scoreList) the next time it migrates, then forgets.
CREATE TABLE "private"."rescore_lists" (
  "user_id" uuid NOT NULL,
  "media_type" "media_type" NOT NULL,
  "genre_id" integer NOT NULL,
  "tier" "tier" NOT NULL,
  PRIMARY KEY ("user_id", "media_type", "genre_id", "tier")
);--> statement-breakpoint
ALTER TABLE "private"."rescore_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "private"."rescore_lists" ("user_id", "media_type", "genre_id", "tier")
SELECT DISTINCT "user_id", "media_type", "genre_id", "tier" FROM "title_entries" WHERE "compare_pending";
