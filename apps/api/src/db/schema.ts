import type { EpisodeRef, Genre, ImportCounts, ImportSource, ImportUnmatched, SeasonSummary, TitleSummary } from "@encore/shared";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

/*
 * The tables as they exist in Supabase. drizzle/0000_supabase_baseline.sql
 * creates them together with what Drizzle can't express: Row Level Security
 * policies, column grants, the sign-up trigger on auth.users, privacy helper
 * functions and the moderation triggers. The API connects as the table owner,
 * so it isn't subject to RLS; the policies guard the app's direct access.
 */

export const mediaTypeEnum = pgEnum("media_type", ["movie", "tv", "book"]);
export const tierEnum = pgEnum("tier", ["liked", "fine", "disliked"]);
export const songReactionEnum = pgEnum("song_reaction", ["loved", "liked", "disliked"]);
export const showKindEnum = pgEnum("show_kind", ["concert", "festival", "dj_set", "theatre", "comedy", "other"]);
export const performerRoleEnum = pgEnum("performer_role", ["headliner", "support", "guest"]);
export const profileVisibilityEnum = pgEnum("profile_visibility", ["private", "friends", "public"]);
export const reportKindEnum = pgEnum("report_kind", ["user", "review", "show_note"]);
export const reportReasonEnum = pgEnum("report_reason", ["spam", "harassment", "hate", "sexual", "impersonation", "other"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "actioned", "dismissed"]);
export const importSourceEnum = pgEnum("import_source", ["letterboxd", "goodreads"]);
export const importStatusEnum = pgEnum("import_status", ["running", "done", "failed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * What other signed-in people may see about someone. One row per Supabase Auth
 * user, created by the on_auth_user_created trigger from the sign-up metadata.
 * Email and password live in auth.users.
 */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** Shown as typed ("Bob"); unique ignoring case, so "bob" can't also sign up. */
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    /** Who can see rankings, scores and live shows: only me, friends, or any signed-in user. */
    profileVisibility: profileVisibilityEnum("profile_visibility").notNull().default("friends"),
    /** Friends also see reviews and show notes. Nobody else ever does. */
    shareReviews: boolean("share_reviews").notNull().default(true),
    /** Appears in people search. Friends and anyone with the profile link can still find them. */
    searchable: boolean("searchable").notNull().default(true),
    allowFriendRequests: boolean("allow_friend_requests").notNull().default(true),
    /** Friends can tag them in "watched with". */
    allowTags: boolean("allow_tags").notNull().default(true),
    /** Friends see their watchlist ("2 friends want to watch this"). */
    shareWatchlist: boolean("share_watchlist").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("profiles_username_lower_idx").on(sql`lower(${t.username})`),
    check("profiles_username_format", sql`${t.username} ~ '^[A-Za-z0-9_]{3,24}$'`),
    check("profiles_display_name_length", sql`char_length(btrim(${t.displayName})) between 1 and 60`),
  ],
);

/** Settings only their owner ever sees. Created alongside the profile. */
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    country: text("country"),
    countryManual: boolean("country_manual").notNull().default(false),
    /** "My services": TMDB watch-provider ids the user subscribes to. */
    services: jsonb("services").$type<number[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [check("user_settings_country_format", sql`${t.country} ~ '^[A-Z]{2}$'`)],
);

/**
 * Local cache of catalog metadata so lists/profiles never hit TMDB or Open Library.
 * For books, `tmdbId` holds the number from the Open Library work id.
 */
export const titles = pgTable(
  "titles",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    name: text("name").notNull(),
    year: integer("year"),
    overview: text("overview").notNull().default(""),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    genres: jsonb("genres").$type<Genre[]>().notNull().default([]),
    seasons: jsonb("seasons").$type<SeasonSummary[]>().notNull().default([]),
    /** Books only. */
    author: text("author"),
    pageCount: integer("page_count"),
    /** Which catalog provider produced this row. */
    source: text("source").$type<"tmdb" | "demo" | "openlibrary">().notNull().default("demo"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("titles_tmdb_unique").on(t.tmdbId, t.mediaType),
    check("titles_source_known", sql`${t.source} in ('tmdb', 'demo', 'openlibrary')`),
  ],
);

/**
 * One row per (user, title): its place in the (media type, genre, tier)
 * ranking. `position` is a fractional index (ascending = better) so inserts
 * touch one row; `score` is denormalised and recomputed per list after each
 * change so reads are a plain SELECT. The review is in `entryReviews`.
 */
export const titleEntries = pgTable(
  "title_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id),
    mediaType: mediaTypeEnum("media_type").notNull(),
    genreId: integer("genre_id").notNull(),
    tier: tierEnum("tier").notNull(),
    position: doublePrecision("position").notNull(),
    score: real("score").notNull(),
    /** Score you set with the slider (first titles in a list); null = derived from rank. */
    userScore: real("user_score"),
    /** Stars it had on Letterboxd or Goodreads when imported; null if you ranked it in Encore. Keeps imports in star order. */
    importStars: real("import_stars"),
    /** Imported and not yet compared against the rest of its list. */
    comparePending: boolean("compare_pending").notNull().default(false),
    favoriteEpisode: jsonb("favorite_episode").$type<EpisodeRef>(),
    leastFavoriteEpisode: jsonb("least_favorite_episode").$type<EpisodeRef>(),
    watchedAt: date("watched_at", { mode: "string" }),
    ...timestamps,
  },
  (t) => [
    unique("title_entries_user_title_unique").on(t.userId, t.titleId),
    index("entries_rank_list_idx").on(t.userId, t.mediaType, t.genreId, t.tier, t.position),
    index("entries_user_score_idx").on(t.userId, t.mediaType, t.score),
    index("entries_trending_idx").on(t.mediaType, t.createdAt),
    index("entries_title_idx").on(t.titleId),
    check("title_entries_score_range", sql`${t.score} between 0 and 10`),
    check("title_entries_user_score_range", sql`${t.userScore} between 0 and 10`),
  ],
);

/**
 * The review on an entry. Kept apart from the entry so Row Level Security can
 * show friends a score without the review when reviews aren't shared.
 */
export const entryReviews = pgTable(
  "entry_reviews",
  {
    entryId: uuid("entry_id")
      .primaryKey()
      .references(() => titleEntries.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    review: text("review").notNull(),
    ...timestamps,
  },
  (t) => [
    index("entry_reviews_user_idx").on(t.userId),
    check("entry_reviews_length", sql`char_length(${t.review}) between 1 and 5000`),
  ],
);

/**
 * Seasons of one show, ranked against each other the same way titles are ranked
 * inside a genre: one list per (user, show, tier), fractional position, denormalised score.
 */
export const seasonEntries = pgTable(
  "season_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id),
    seasonNumber: integer("season_number").notNull(),
    tier: tierEnum("tier").notNull(),
    position: doublePrecision("position").notNull(),
    score: real("score").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("season_entries_unique").on(t.userId, t.titleId, t.seasonNumber),
    index("season_entries_rank_idx").on(t.userId, t.titleId, t.tier, t.position),
    index("season_entries_title_idx").on(t.titleId),
    check("season_entries_score_range", sql`${t.score} between 0 and 10`),
  ],
);

/**
 * Episodes of one show, ranked against each other across all its seasons: one
 * list per (user, show, tier), like seasons. The episode's name and still are
 * copied in so cross-show lists never need the catalog.
 */
export const episodeEntries = pgTable(
  "episode_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    name: text("name").notNull(),
    stillUrl: text("still_url"),
    tier: tierEnum("tier").notNull(),
    position: doublePrecision("position").notNull(),
    score: real("score").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("episode_entries_unique").on(t.userId, t.titleId, t.seasonNumber, t.episodeNumber),
    index("episode_entries_rank_idx").on(t.userId, t.titleId, t.tier, t.position),
    index("episode_entries_title_idx").on(t.titleId),
    check("episode_entries_score_range", sql`${t.score} between 0 and 10`),
  ],
);

/**
 * "Not interested" picks from the recommended feed. Keyed by TMDB id so dismissing
 * never has to fetch the title; genre ids are kept to soften similar suggestions.
 */
export const dismissedTitles = pgTable(
  "dismissed_titles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    mediaType: mediaTypeEnum("media_type").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    genreIds: jsonb("genre_ids").$type<number[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mediaType, t.tmdbId] })],
);

/** Persistent layer of the third-party response cache, so restarts and new instances start warm. */
export const cacheEntries = pgTable(
  "cache_entries",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("cache_entries_fetched_idx").on(t.fetchedAt)],
);

/** Musicians, bands, DJs, comedians, casts. MusicBrainz-backed when `mbid` is set. */
export const performers = pgTable(
  "performers",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    mbid: uuid("mbid").unique(),
    name: text("name").notNull(),
    disambiguation: text("disambiguation"),
    country: text("country"),
    type: text("type"),
    imageUrl: text("image_url"),
  },
  (t) => [
    uniqueIndex("performers_manual_name_idx")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.mbid} IS NULL`),
  ],
);

export const venues = pgTable(
  "venues",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    setlistFmId: text("setlist_fm_id").unique(),
    name: text("name").notNull(),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
  },
  (t) => [index("venues_name_city_idx").on(sql`lower(${t.name})`, sql`lower(coalesce(${t.city}, ''))`)],
);

/** A show someone went to. What they liked, disliked and noted is in `liveShowNotes`. */
export const liveShows = pgTable(
  "live_shows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: showKindEnum("kind").notNull().default("concert"),
    name: text("name"),
    date: date("date", { mode: "string" }).notNull(),
    venueId: integer("venue_id").references(() => venues.id),
    tourName: text("tour_name"),
    setlistFmId: text("setlist_fm_id"),
    rating: real("rating"),
    ...timestamps,
  },
  (t) => [
    index("live_shows_user_date_idx").on(t.userId, t.date),
    index("live_shows_venue_idx").on(t.venueId),
    check("live_shows_name_length", sql`char_length(${t.name}) <= 200`),
    check("live_shows_tour_length", sql`char_length(${t.tourName}) <= 300`),
    check("live_shows_setlist_length", sql`char_length(${t.setlistFmId}) <= 50`),
    check("live_shows_rating_range", sql`${t.rating} between 0 and 10`),
  ],
);

/** What someone liked, disliked and noted about a show. Apart from the show for the same reason as reviews. */
export const liveShowNotes = pgTable(
  "live_show_notes",
  {
    showId: uuid("show_id")
      .primaryKey()
      .references(() => liveShows.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    liked: text("liked"),
    disliked: text("disliked"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("live_show_notes_user_idx").on(t.userId),
    check("live_show_notes_liked_length", sql`char_length(${t.liked}) <= 5000`),
    check("live_show_notes_disliked_length", sql`char_length(${t.disliked}) <= 5000`),
    check("live_show_notes_notes_length", sql`char_length(${t.notes}) <= 5000`),
  ],
);

/** Billing for a show: headliner(s), support acts, guests — in order. */
export const liveShowPerformers = pgTable(
  "live_show_performers",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    showId: uuid("show_id")
      .notNull()
      .references(() => liveShows.id, { onDelete: "cascade" }),
    performerId: integer("performer_id")
      .notNull()
      .references(() => performers.id),
    role: performerRoleEnum("role").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("lsp_show_idx").on(t.showId, t.position), index("lsp_performer_idx").on(t.performerId)],
);

/** Songs are attached to the lineup slot, so each act has its own setlist. Notes are in `liveShowSongNotes`. */
export const liveShowSongs = pgTable(
  "live_show_songs",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    slotId: integer("slot_id")
      .notNull()
      .references(() => liveShowPerformers.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    encore: boolean("encore").notNull().default(false),
    reaction: songReactionEnum("reaction"),
  },
  (t) => [
    index("live_show_songs_slot_idx").on(t.slotId, t.position),
    check("live_show_songs_title_length", sql`char_length(${t.title}) between 1 and 300`),
  ],
);

/** Someone's note on one song of a show they went to. */
export const liveShowSongNotes = pgTable(
  "live_show_song_notes",
  {
    songId: integer("song_id")
      .primaryKey()
      .references(() => liveShowSongs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
    ...timestamps,
  },
  (t) => [
    index("live_show_song_notes_user_idx").on(t.userId),
    check("live_show_song_notes_length", sql`char_length(${t.note}) between 1 and 500`),
  ],
);

export const watchlistKindEnum = pgEnum("watchlist_kind", ["movie", "tv", "book", "performer", "festival"]);

/**
 * Things a user wants to watch, read or see live. Movies, shows and books point at `titles`,
 * artists at `performers`; festivals have no catalog, so their details live inline.
 * Plain unique constraints (NULLs never collide) so the app can upsert against them.
 */
export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: watchlistKindEnum("kind").notNull(),
    titleId: integer("title_id").references(() => titles.id),
    performerId: integer("performer_id").references(() => performers.id),
    festivalName: text("festival_name"),
    festivalDate: date("festival_date", { mode: "string" }),
    festivalCity: text("festival_city"),
    festivalCountry: text("festival_country"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("watchlist_user_idx").on(t.userId, t.kind, t.createdAt),
    index("watchlist_title_idx").on(t.titleId),
    index("watchlist_performer_idx").on(t.performerId),
    unique("watchlist_user_title_unique").on(t.userId, t.titleId),
    unique("watchlist_user_performer_unique").on(t.userId, t.performerId),
    uniqueIndex("watchlist_user_festival_idx")
      .on(t.userId, sql`lower(${t.festivalName})`)
      .where(sql`${t.festivalName} IS NOT NULL`),
    check("watchlist_festival_name_length", sql`char_length(${t.festivalName}) <= 200`),
    check("watchlist_festival_city_length", sql`char_length(${t.festivalCity}) <= 200`),
    check("watchlist_festival_country_length", sql`char_length(${t.festivalCountry}) <= 100`),
    check("watchlist_note_length", sql`char_length(${t.note}) <= 500`),
    check(
      "watchlist_kind_matches_target",
      sql`case ${t.kind}
        when 'performer' then ${t.performerId} is not null and ${t.titleId} is null and ${t.festivalName} is null
        when 'festival' then ${t.festivalName} is not null and ${t.titleId} is null and ${t.performerId} is null
        else ${t.titleId} is not null and ${t.performerId} is null and ${t.festivalName} is null
      end`,
    ),
  ],
);

export const watchlistItemsRelations = relations(watchlistItems, ({ one }) => ({
  title: one(titles, { fields: [watchlistItems.titleId], references: [titles.id] }),
  performer: one(performers, { fields: [watchlistItems.performerId], references: [performers.id] }),
}));

export const titleEntriesRelations = relations(titleEntries, ({ one }) => ({
  title: one(titles, { fields: [titleEntries.titleId], references: [titles.id] }),
  user: one(profiles, { fields: [titleEntries.userId], references: [profiles.id] }),
  review: one(entryReviews, { fields: [titleEntries.id], references: [entryReviews.entryId] }),
}));

export const liveShowsRelations = relations(liveShows, ({ one, many }) => ({
  user: one(profiles, { fields: [liveShows.userId], references: [profiles.id] }),
  venue: one(venues, { fields: [liveShows.venueId], references: [venues.id] }),
  notes: one(liveShowNotes, { fields: [liveShows.id], references: [liveShowNotes.showId] }),
  lineup: many(liveShowPerformers),
}));

export const liveShowPerformersRelations = relations(liveShowPerformers, ({ one, many }) => ({
  show: one(liveShows, { fields: [liveShowPerformers.showId], references: [liveShows.id] }),
  performer: one(performers, { fields: [liveShowPerformers.performerId], references: [performers.id] }),
  songs: many(liveShowSongs),
}));

export const liveShowSongsRelations = relations(liveShowSongs, ({ one }) => ({
  slot: one(liveShowPerformers, { fields: [liveShowSongs.slotId], references: [liveShowPerformers.id] }),
  note: one(liveShowSongNotes, { fields: [liveShowSongs.id], references: [liveShowSongNotes.songId] }),
}));

/** A pending friend request. Accepting it deletes the row and creates the friendship. */
export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("friend_requests_pair_unique").on(t.fromUserId, t.toUserId),
    index("friend_requests_to_idx").on(t.toUserId, t.createdAt),
    check("friend_requests_not_self", sql`${t.fromUserId} <> ${t.toUserId}`),
  ],
);

/** Mutual friendships, stored as two rows per pair so "my friends" is a single indexed lookup. */
export const friendships = pgTable(
  "friendships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.friendId] }),
    index("friendships_friend_idx").on(t.friendId),
    check("friendships_not_self", sql`${t.userId} <> ${t.friendId}`),
  ],
);

/** Blocks hide both people from each other everywhere. The blocked person isn't told. */
export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("blocks_blocked_idx").on(t.blockedId),
    check("blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);

/**
 * "Watched with": who someone watched a title (their entry) or live show with.
 * Either a friend (`friendId`, confirmed once they accept) or a free-text name
 * that only the owner ever sees.
 */
export const watchCompanions = pgTable(
  "watch_companions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    titleEntryId: uuid("title_entry_id").references(() => titleEntries.id, { onDelete: "cascade" }),
    liveShowId: uuid("live_show_id").references(() => liveShows.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id").references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name"),
    confirmed: boolean("confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("companions_owner_idx").on(t.ownerId),
    index("companions_entry_idx").on(t.titleEntryId),
    index("companions_show_idx").on(t.liveShowId),
    index("companions_friend_idx").on(t.friendId, t.confirmed),
    unique("companions_entry_friend_unique").on(t.titleEntryId, t.friendId),
    unique("companions_show_friend_unique").on(t.liveShowId, t.friendId),
    check("companions_one_target", sql`num_nonnulls(${t.titleEntryId}, ${t.liveShowId}) = 1`),
    check("companions_one_person", sql`num_nonnulls(${t.friendId}, ${t.name}) = 1`),
    check("companions_not_self", sql`${t.friendId} is distinct from ${t.ownerId}`),
    check("companions_name_length", sql`char_length(${t.name}) between 1 and 60`),
  ],
);

/**
 * Reports of people or of something they wrote, for moderation (App Store guideline 1.2).
 * Kept when either account is deleted, so a reporter can't erase a report by leaving.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").references(() => profiles.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id").references(() => profiles.id, { onDelete: "set null" }),
    /** Username at report time, so the report still makes sense after a rename or deletion. */
    targetUsername: text("target_username").notNull(),
    kind: reportKindEnum("kind").notNull(),
    /** The entry or live show reported, for review and show_note reports. */
    targetId: uuid("target_id"),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details"),
    status: reportStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("reports_status_idx").on(t.status, t.createdAt),
    index("reports_reporter_idx").on(t.reporterId),
    index("reports_target_user_idx").on(t.targetUserId),
    check("reports_details_length", sql`char_length(${t.details}) <= 1000`),
    check("reports_target_given", sql`${t.kind} = 'user' or ${t.targetId} is not null`),
  ],
);

/**
 * Each user's latest import from each source (Letterboxd, Goodreads): progress
 * while it runs, then what it did and the items still to sort out by hand.
 * Importing again replaces that source's row.
 */
export const catalogImports = pgTable(
  "catalog_imports",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    source: importSourceEnum("source").$type<ImportSource>().notNull(),
    status: importStatusEnum("status").notNull(),
    done: integer("done").notNull().default(0),
    total: integer("total").notNull(),
    error: text("error"),
    counts: jsonb("counts").$type<ImportCounts>().notNull(),
    unmatched: jsonb("unmatched").$type<StoredUnmatched[]>().notNull().default([]),
    notRated: jsonb("not_rated").$type<TitleSummary[]>().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source] })],
);

/** An unmatched item plus what's needed to import it once the user picks the title. */
export type StoredUnmatched = ImportUnmatched & { review: string | null; loggedAt: string | null };
