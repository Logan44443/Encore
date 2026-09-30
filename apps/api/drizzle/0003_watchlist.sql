CREATE TYPE "public"."watchlist_kind" AS ENUM('movie', 'tv', 'performer', 'festival');--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "watchlist_kind" NOT NULL,
	"title_id" integer,
	"performer_id" integer,
	"festival_name" text,
	"festival_date" date,
	"festival_city" text,
	"festival_country" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watchlist_user_idx" ON "watchlist_items" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_title_idx" ON "watchlist_items" USING btree ("user_id","title_id") WHERE "watchlist_items"."title_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_performer_idx" ON "watchlist_items" USING btree ("user_id","performer_id") WHERE "watchlist_items"."performer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_festival_idx" ON "watchlist_items" USING btree ("user_id",lower("festival_name")) WHERE "watchlist_items"."festival_name" IS NOT NULL;