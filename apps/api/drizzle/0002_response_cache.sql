CREATE TABLE "cache_entries" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cache_entries_fetched_idx" ON "cache_entries" USING btree ("fetched_at");