ALTER TYPE "public"."media_type" ADD VALUE 'book';--> statement-breakpoint
ALTER TYPE "public"."watchlist_kind" ADD VALUE 'book' BEFORE 'performer';--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "page_count" integer;