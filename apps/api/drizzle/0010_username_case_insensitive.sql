-- Usernames now keep their capitalisation but must be unique ignoring case.
-- The app always lowercased them before, so clashes shouldn't exist; if any do
-- (e.g. rows edited by hand), the older account keeps the name and the newer
-- one gets a short suffix so the index can be built.
UPDATE "users" u SET "username" = left(u."username", 18) || '_' || left(md5(u."id"::text), 5)
WHERE EXISTS (
  SELECT 1 FROM "users" o
  WHERE lower(o."username") = lower(u."username")
    AND (o."created_at", o."id") < (u."created_at", u."id")
);--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));
