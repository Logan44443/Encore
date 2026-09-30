CREATE TABLE "season_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" integer NOT NULL,
	"season_number" integer NOT NULL,
	"tier" "tier" NOT NULL,
	"position" double precision NOT NULL,
	"score" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_entries" ADD CONSTRAINT "season_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_entries" ADD CONSTRAINT "season_entries_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "season_entries_user_show_season_idx" ON "season_entries" USING btree ("user_id","title_id","season_number");--> statement-breakpoint
CREATE INDEX "season_entries_rank_idx" ON "season_entries" USING btree ("user_id","title_id","tier","position");