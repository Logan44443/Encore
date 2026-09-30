CREATE TYPE "public"."media_type" AS ENUM('movie', 'tv');--> statement-breakpoint
CREATE TYPE "public"."performer_role" AS ENUM('headliner', 'support', 'guest');--> statement-breakpoint
CREATE TYPE "public"."show_kind" AS ENUM('concert', 'festival', 'dj_set', 'theatre', 'comedy', 'other');--> statement-breakpoint
CREATE TYPE "public"."song_reaction" AS ENUM('loved', 'liked', 'disliked');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('liked', 'fine', 'disliked');--> statement-breakpoint
CREATE TABLE "live_show_performers" (
	"id" serial PRIMARY KEY NOT NULL,
	"show_id" uuid NOT NULL,
	"performer_id" integer NOT NULL,
	"role" "performer_role" NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_show_songs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_id" integer NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"encore" boolean DEFAULT false NOT NULL,
	"reaction" "song_reaction",
	"note" text
);
--> statement-breakpoint
CREATE TABLE "live_shows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "show_kind" DEFAULT 'concert' NOT NULL,
	"name" text,
	"date" date NOT NULL,
	"venue_id" integer,
	"tour_name" text,
	"setlist_fm_id" text,
	"rating" real,
	"liked" text,
	"disliked" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performers" (
	"id" serial PRIMARY KEY NOT NULL,
	"mbid" uuid,
	"name" text NOT NULL,
	"disambiguation" text,
	"country" text,
	"type" text,
	"image_url" text,
	CONSTRAINT "performers_mbid_unique" UNIQUE("mbid")
);
--> statement-breakpoint
CREATE TABLE "title_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"genre_id" integer NOT NULL,
	"tier" "tier" NOT NULL,
	"position" double precision NOT NULL,
	"score" real NOT NULL,
	"review" text,
	"favorite_episode" jsonb,
	"least_favorite_episode" jsonb,
	"watched_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"name" text NOT NULL,
	"year" integer,
	"overview" text DEFAULT '' NOT NULL,
	"poster_url" text,
	"backdrop_url" text,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"setlist_fm_id" text,
	"name" text NOT NULL,
	"city" text,
	"region" text,
	"country" text,
	"lat" double precision,
	"lng" double precision,
	CONSTRAINT "venues_setlist_fm_id_unique" UNIQUE("setlist_fm_id")
);
--> statement-breakpoint
ALTER TABLE "live_show_performers" ADD CONSTRAINT "live_show_performers_show_id_live_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."live_shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_show_performers" ADD CONSTRAINT "live_show_performers_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_show_songs" ADD CONSTRAINT "live_show_songs_slot_id_live_show_performers_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."live_show_performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_shows" ADD CONSTRAINT "live_shows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_shows" ADD CONSTRAINT "live_shows_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_entries" ADD CONSTRAINT "title_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_entries" ADD CONSTRAINT "title_entries_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lsp_show_idx" ON "live_show_performers" USING btree ("show_id","position");--> statement-breakpoint
CREATE INDEX "lsp_performer_idx" ON "live_show_performers" USING btree ("performer_id");--> statement-breakpoint
CREATE INDEX "live_show_songs_slot_idx" ON "live_show_songs" USING btree ("slot_id","position");--> statement-breakpoint
CREATE INDEX "live_shows_user_date_idx" ON "live_shows" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "live_shows_venue_idx" ON "live_shows" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performers_manual_name_idx" ON "performers" USING btree (lower("name")) WHERE "performers"."mbid" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_user_title_idx" ON "title_entries" USING btree ("user_id","title_id");--> statement-breakpoint
CREATE INDEX "entries_rank_list_idx" ON "title_entries" USING btree ("user_id","media_type","genre_id","tier","position");--> statement-breakpoint
CREATE INDEX "entries_user_score_idx" ON "title_entries" USING btree ("user_id","media_type","score");--> statement-breakpoint
CREATE INDEX "entries_trending_idx" ON "title_entries" USING btree ("media_type","created_at");--> statement-breakpoint
CREATE INDEX "entries_title_idx" ON "title_entries" USING btree ("title_id");--> statement-breakpoint
CREATE UNIQUE INDEX "titles_tmdb_idx" ON "titles" USING btree ("tmdb_id","media_type");--> statement-breakpoint
CREATE INDEX "venues_name_city_idx" ON "venues" USING btree (lower("name"),lower(coalesce("city", '')));