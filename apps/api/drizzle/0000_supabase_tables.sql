CREATE TYPE "public"."import_source" AS ENUM('letterboxd', 'goodreads');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('movie', 'tv', 'book');--> statement-breakpoint
CREATE TYPE "public"."performer_role" AS ENUM('headliner', 'support', 'guest');--> statement-breakpoint
CREATE TYPE "public"."profile_visibility" AS ENUM('private', 'friends', 'public');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('user', 'review', 'show_note');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'harassment', 'hate', 'sexual', 'impersonation', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."show_kind" AS ENUM('concert', 'festival', 'dj_set', 'theatre', 'comedy', 'other');--> statement-breakpoint
CREATE TYPE "public"."song_reaction" AS ENUM('loved', 'liked', 'disliked');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('liked', 'fine', 'disliked');--> statement-breakpoint
CREATE TYPE "public"."watchlist_kind" AS ENUM('movie', 'tv', 'book', 'performer', 'festival');--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "blocks_not_self" CHECK ("blocks"."blocker_id" <> "blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "cache_entries" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_imports" (
	"user_id" uuid NOT NULL,
	"source" "import_source" NOT NULL,
	"status" "import_status" NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"error" text,
	"counts" jsonb NOT NULL,
	"unmatched" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"not_rated" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "catalog_imports_user_id_source_pk" PRIMARY KEY("user_id","source")
);
--> statement-breakpoint
CREATE TABLE "dismissed_titles" (
	"user_id" uuid NOT NULL,
	"media_type" "media_type" NOT NULL,
	"tmdb_id" integer NOT NULL,
	"genre_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dismissed_titles_user_id_media_type_tmdb_id_pk" PRIMARY KEY("user_id","media_type","tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "entry_reviews" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"review" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_reviews_length" CHECK (char_length("entry_reviews"."review") between 1 and 5000)
);
--> statement-breakpoint
CREATE TABLE "episode_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" integer NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"name" text NOT NULL,
	"still_url" text,
	"tier" "tier" NOT NULL,
	"position" double precision NOT NULL,
	"score" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_entries_unique" UNIQUE("user_id","title_id","season_number","episode_number"),
	CONSTRAINT "episode_entries_score_range" CHECK ("episode_entries"."score" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_requests_pair_unique" UNIQUE("from_user_id","to_user_id"),
	CONSTRAINT "friend_requests_not_self" CHECK ("friend_requests"."from_user_id" <> "friend_requests"."to_user_id")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_id_friend_id_pk" PRIMARY KEY("user_id","friend_id"),
	CONSTRAINT "friendships_not_self" CHECK ("friendships"."user_id" <> "friendships"."friend_id")
);
--> statement-breakpoint
CREATE TABLE "live_show_notes" (
	"show_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"liked" text,
	"disliked" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_show_notes_liked_length" CHECK (char_length("live_show_notes"."liked") <= 5000),
	CONSTRAINT "live_show_notes_disliked_length" CHECK (char_length("live_show_notes"."disliked") <= 5000),
	CONSTRAINT "live_show_notes_notes_length" CHECK (char_length("live_show_notes"."notes") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "live_show_performers" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "live_show_performers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"show_id" uuid NOT NULL,
	"performer_id" integer NOT NULL,
	"role" "performer_role" NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_show_song_notes" (
	"song_id" integer PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_show_song_notes_length" CHECK (char_length("live_show_song_notes"."note") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "live_show_songs" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "live_show_songs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slot_id" integer NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"encore" boolean DEFAULT false NOT NULL,
	"reaction" "song_reaction",
	CONSTRAINT "live_show_songs_title_length" CHECK (char_length("live_show_songs"."title") between 1 and 300)
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_shows_name_length" CHECK (char_length("live_shows"."name") <= 200),
	CONSTRAINT "live_shows_tour_length" CHECK (char_length("live_shows"."tour_name") <= 300),
	CONSTRAINT "live_shows_setlist_length" CHECK (char_length("live_shows"."setlist_fm_id") <= 50),
	CONSTRAINT "live_shows_rating_range" CHECK ("live_shows"."rating" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "performers" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "performers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mbid" uuid,
	"name" text NOT NULL,
	"disambiguation" text,
	"country" text,
	"type" text,
	"image_url" text,
	CONSTRAINT "performers_mbid_unique" UNIQUE("mbid")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"profile_visibility" "profile_visibility" DEFAULT 'friends' NOT NULL,
	"share_reviews" boolean DEFAULT true NOT NULL,
	"searchable" boolean DEFAULT true NOT NULL,
	"allow_friend_requests" boolean DEFAULT true NOT NULL,
	"allow_tags" boolean DEFAULT true NOT NULL,
	"share_watchlist" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username_format" CHECK ("profiles"."username" ~ '^[A-Za-z0-9_]{3,24}$'),
	CONSTRAINT "profiles_display_name_length" CHECK (char_length(btrim("profiles"."display_name")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"target_user_id" uuid,
	"target_username" text NOT NULL,
	"kind" "report_kind" NOT NULL,
	"target_id" uuid,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "reports_details_length" CHECK (char_length("reports"."details") <= 1000),
	CONSTRAINT "reports_target_given" CHECK ("reports"."kind" = 'user' or "reports"."target_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "season_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" integer NOT NULL,
	"season_number" integer NOT NULL,
	"tier" "tier" NOT NULL,
	"position" double precision NOT NULL,
	"score" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_entries_unique" UNIQUE("user_id","title_id","season_number"),
	CONSTRAINT "season_entries_score_range" CHECK ("season_entries"."score" between 0 and 10)
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
	"user_score" real,
	"favorite_episode" jsonb,
	"least_favorite_episode" jsonb,
	"watched_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_entries_user_title_unique" UNIQUE("user_id","title_id"),
	CONSTRAINT "title_entries_score_range" CHECK ("title_entries"."score" between 0 and 10),
	CONSTRAINT "title_entries_user_score_range" CHECK ("title_entries"."user_score" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "titles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tmdb_id" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"name" text NOT NULL,
	"year" integer,
	"overview" text DEFAULT '' NOT NULL,
	"poster_url" text,
	"backdrop_url" text,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author" text,
	"page_count" integer,
	"source" text DEFAULT 'demo' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titles_tmdb_unique" UNIQUE("tmdb_id","media_type"),
	CONSTRAINT "titles_source_known" CHECK ("titles"."source" in ('tmdb', 'demo', 'openlibrary'))
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"country" text,
	"country_manual" boolean DEFAULT false NOT NULL,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_country_format" CHECK ("user_settings"."country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "venues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
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
CREATE TABLE "watch_companions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title_entry_id" uuid,
	"live_show_id" uuid,
	"friend_id" uuid,
	"name" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companions_entry_friend_unique" UNIQUE("title_entry_id","friend_id"),
	CONSTRAINT "companions_show_friend_unique" UNIQUE("live_show_id","friend_id"),
	CONSTRAINT "companions_one_target" CHECK (num_nonnulls("watch_companions"."title_entry_id", "watch_companions"."live_show_id") = 1),
	CONSTRAINT "companions_one_person" CHECK (num_nonnulls("watch_companions"."friend_id", "watch_companions"."name") = 1),
	CONSTRAINT "companions_not_self" CHECK ("watch_companions"."friend_id" is distinct from "watch_companions"."owner_id"),
	CONSTRAINT "companions_name_length" CHECK (char_length("watch_companions"."name") between 1 and 60)
);
--> statement-breakpoint
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_user_title_unique" UNIQUE("user_id","title_id"),
	CONSTRAINT "watchlist_user_performer_unique" UNIQUE("user_id","performer_id"),
	CONSTRAINT "watchlist_festival_name_length" CHECK (char_length("watchlist_items"."festival_name") <= 200),
	CONSTRAINT "watchlist_festival_city_length" CHECK (char_length("watchlist_items"."festival_city") <= 200),
	CONSTRAINT "watchlist_festival_country_length" CHECK (char_length("watchlist_items"."festival_country") <= 100),
	CONSTRAINT "watchlist_note_length" CHECK (char_length("watchlist_items"."note") <= 500),
	CONSTRAINT "watchlist_kind_matches_target" CHECK (case "watchlist_items"."kind"
        when 'performer' then "watchlist_items"."performer_id" is not null and "watchlist_items"."title_id" is null and "watchlist_items"."festival_name" is null
        when 'festival' then "watchlist_items"."festival_name" is not null and "watchlist_items"."title_id" is null and "watchlist_items"."performer_id" is null
        else "watchlist_items"."title_id" is not null and "watchlist_items"."performer_id" is null and "watchlist_items"."festival_name" is null
      end)
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_profiles_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_profiles_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_imports" ADD CONSTRAINT "catalog_imports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dismissed_titles" ADD CONSTRAINT "dismissed_titles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_reviews" ADD CONSTRAINT "entry_reviews_entry_id_title_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."title_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_reviews" ADD CONSTRAINT "entry_reviews_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_entries" ADD CONSTRAINT "episode_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_entries" ADD CONSTRAINT "episode_entries_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_from_user_id_profiles_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_to_user_id_profiles_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_show_notes" ADD CONSTRAINT "live_show_notes_show_id_live_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."live_shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_show_notes" ADD CONSTRAINT "live_show_notes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_show_performers" ADD CONSTRAINT "live_show_performers_show_id_live_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."live_shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_show_performers" ADD CONSTRAINT "live_show_performers_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_show_song_notes" ADD CONSTRAINT "live_show_song_notes_song_id_live_show_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."live_show_songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_show_song_notes" ADD CONSTRAINT "live_show_song_notes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_show_songs" ADD CONSTRAINT "live_show_songs_slot_id_live_show_performers_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."live_show_performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_shows" ADD CONSTRAINT "live_shows_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_shows" ADD CONSTRAINT "live_shows_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_profiles_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_entries" ADD CONSTRAINT "season_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_entries" ADD CONSTRAINT "season_entries_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_entries" ADD CONSTRAINT "title_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_entries" ADD CONSTRAINT "title_entries_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_companions" ADD CONSTRAINT "watch_companions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_companions" ADD CONSTRAINT "watch_companions_title_entry_id_title_entries_id_fk" FOREIGN KEY ("title_entry_id") REFERENCES "public"."title_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_companions" ADD CONSTRAINT "watch_companions_live_show_id_live_shows_id_fk" FOREIGN KEY ("live_show_id") REFERENCES "public"."live_shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_companions" ADD CONSTRAINT "watch_companions_friend_id_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "cache_entries_fetched_idx" ON "cache_entries" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "entry_reviews_user_idx" ON "entry_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "episode_entries_rank_idx" ON "episode_entries" USING btree ("user_id","title_id","tier","position");--> statement-breakpoint
CREATE INDEX "episode_entries_title_idx" ON "episode_entries" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "friend_requests_to_idx" ON "friend_requests" USING btree ("to_user_id","created_at");--> statement-breakpoint
CREATE INDEX "friendships_friend_idx" ON "friendships" USING btree ("friend_id");--> statement-breakpoint
CREATE INDEX "live_show_notes_user_idx" ON "live_show_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lsp_show_idx" ON "live_show_performers" USING btree ("show_id","position");--> statement-breakpoint
CREATE INDEX "lsp_performer_idx" ON "live_show_performers" USING btree ("performer_id");--> statement-breakpoint
CREATE INDEX "live_show_song_notes_user_idx" ON "live_show_song_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_show_songs_slot_idx" ON "live_show_songs" USING btree ("slot_id","position");--> statement-breakpoint
CREATE INDEX "live_shows_user_date_idx" ON "live_shows" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "live_shows_venue_idx" ON "live_shows" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performers_manual_name_idx" ON "performers" USING btree (lower("name")) WHERE "performers"."mbid" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_lower_idx" ON "profiles" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "reports_target_user_idx" ON "reports" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "season_entries_rank_idx" ON "season_entries" USING btree ("user_id","title_id","tier","position");--> statement-breakpoint
CREATE INDEX "season_entries_title_idx" ON "season_entries" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "entries_rank_list_idx" ON "title_entries" USING btree ("user_id","media_type","genre_id","tier","position");--> statement-breakpoint
CREATE INDEX "entries_user_score_idx" ON "title_entries" USING btree ("user_id","media_type","score");--> statement-breakpoint
CREATE INDEX "entries_trending_idx" ON "title_entries" USING btree ("media_type","created_at");--> statement-breakpoint
CREATE INDEX "entries_title_idx" ON "title_entries" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "venues_name_city_idx" ON "venues" USING btree (lower("name"),lower(coalesce("city", '')));--> statement-breakpoint
CREATE INDEX "companions_owner_idx" ON "watch_companions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "companions_entry_idx" ON "watch_companions" USING btree ("title_entry_id");--> statement-breakpoint
CREATE INDEX "companions_show_idx" ON "watch_companions" USING btree ("live_show_id");--> statement-breakpoint
CREATE INDEX "companions_friend_idx" ON "watch_companions" USING btree ("friend_id","confirmed");--> statement-breakpoint
CREATE INDEX "watchlist_user_idx" ON "watchlist_items" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "watchlist_title_idx" ON "watchlist_items" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "watchlist_performer_idx" ON "watchlist_items" USING btree ("performer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_festival_idx" ON "watchlist_items" USING btree ("user_id",lower("festival_name")) WHERE "watchlist_items"."festival_name" IS NOT NULL;