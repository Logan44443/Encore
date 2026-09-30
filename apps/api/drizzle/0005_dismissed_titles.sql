CREATE TABLE "dismissed_titles" (
	"user_id" uuid NOT NULL,
	"media_type" "media_type" NOT NULL,
	"tmdb_id" integer NOT NULL,
	"genre_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dismissed_titles" ADD CONSTRAINT "dismissed_titles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dismissed_titles_user_title_idx" ON "dismissed_titles" USING btree ("user_id","media_type","tmdb_id");