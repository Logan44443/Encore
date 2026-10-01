import type { EpisodeRef, Genre, SeasonSummary } from "@encore/shared";
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
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const mediaTypeEnum = pgEnum("media_type", ["movie", "tv"]);
export const tierEnum = pgEnum("tier", ["liked", "fine", "disliked"]);
export const songReactionEnum = pgEnum("song_reaction", ["loved", "liked", "disliked"]);
export const showKindEnum = pgEnum("show_kind", ["concert", "festival", "dj_set", "theatre", "comedy", "other"]);
export const performerRoleEnum = pgEnum("performer_role", ["headliner", "support", "guest"]);
export const profileVisibilityEnum = pgEnum("profile_visibility", ["private", "friends", "public"]);
export const reportKindEnum = pgEnum("report_kind", ["user", "review", "show_note"]);
export const reportReasonEnum = pgEnum("report_reason", ["spam", "harassment", "hate", "sexual", "impersonation", "other"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "actioned", "dismissed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    /** Shown as typed ("Bob"); unique ignoring case, so "bob" can't also sign up. */
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    country: text("country"),
    countryManual: boolean("country_manual").notNull().default(false),
    /** "My services": TMDB watch-provider ids the user subscribes to. */
    services: jsonb("services").$type<number[]>().notNull().default([]),
    /**
     * Sessions issued before this are rejected. Set by a password change or reset and
     * by "Sign out of other devices". (The column predates the last of those.)
     */
    sessionsRevokedAt: timestamp("password_changed_at", { withTimezone: true }),
    /** Who can see rankings, scores and live shows: only me, friends, or any signed-in user. */
    profileVisibility: profileVisibilityEnum("profile_visibility").notNull().default("friends"),
    /** Friends also see reviews and show notes. Nobody else ever does. */
    shareReviews: boolean("share_reviews").notNull().default(true),
    /** Appears in people search. Friends and anyone with the profile link can still find them. */
    searchable: boolean("searchable").notNull().default(true),
    allowFriendRequests: boolean("allow_friend_requests").notNull().default(true),
    /** Friends can tag them in "watched with". */
    allowTags: boolean("allow_tags").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`)],
);

/** Local cache of TMDB metadata so lists/profiles never hit TMDB. */
export const titles = pgTable(
  "titles",
  {
    id: serial("id").primaryKey(),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    name: text("name").notNull(),
    year: integer("year"),
    overview: text("overview").notNull().default(""),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    genres: jsonb("genres").$type<Genre[]>().notNull().default([]),
    seasons: jsonb("seasons").$type<SeasonSummary[]>().notNull().default([]),
    /** Which catalog provider produced this row ("tmdb" | "demo"). */
    source: text("source").notNull().default("demo"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("titles_tmdb_idx").on(t.tmdbId, t.mediaType)],
);

/**
 * One row per (user, title): the user's review plus its place in the
 * (media type, genre, tier) ranking. `position` is a fractional index
 * (ascending = better) so inserts touch one row; `score` is denormalised
 * and recomputed per list after each change so reads are a plain SELECT.
 */
export const titleEntries = pgTable(
  "title_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    review: text("review"),
    favoriteEpisode: jsonb("favorite_episode").$type<EpisodeRef>(),
    leastFavoriteEpisode: jsonb("least_favorite_episode").$type<EpisodeRef>(),
    watchedAt: date("watched_at", { mode: "string" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("entries_user_title_idx").on(t.userId, t.titleId),
    index("entries_rank_list_idx").on(t.userId, t.mediaType, t.genreId, t.tier, t.position),
    index("entries_user_score_idx").on(t.userId, t.mediaType, t.score),
    index("entries_trending_idx").on(t.mediaType, t.createdAt),
    index("entries_title_idx").on(t.titleId),
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
      .references(() => users.id, { onDelete: "cascade" }),
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
    uniqueIndex("season_entries_user_show_season_idx").on(t.userId, t.titleId, t.seasonNumber),
    index("season_entries_rank_idx").on(t.userId, t.titleId, t.tier, t.position),
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
      .references(() => users.id, { onDelete: "cascade" }),
    mediaType: mediaTypeEnum("media_type").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    genreIds: jsonb("genre_ids").$type<number[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dismissed_titles_user_title_idx").on(t.userId, t.mediaType, t.tmdbId)],
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
    id: serial("id").primaryKey(),
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
    id: serial("id").primaryKey(),
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

export const liveShows = pgTable(
  "live_shows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: showKindEnum("kind").notNull().default("concert"),
    name: text("name"),
    date: date("date", { mode: "string" }).notNull(),
    venueId: integer("venue_id").references(() => venues.id),
    tourName: text("tour_name"),
    setlistFmId: text("setlist_fm_id"),
    rating: real("rating"),
    liked: text("liked"),
    disliked: text("disliked"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("live_shows_user_date_idx").on(t.userId, t.date), index("live_shows_venue_idx").on(t.venueId)],
);

/** Billing for a show: headliner(s), support acts, guests — in order. */
export const liveShowPerformers = pgTable(
  "live_show_performers",
  {
    id: serial("id").primaryKey(),
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

/** Songs are attached to the lineup slot, so each act has its own setlist. */
export const liveShowSongs = pgTable(
  "live_show_songs",
  {
    id: serial("id").primaryKey(),
    slotId: integer("slot_id")
      .notNull()
      .references(() => liveShowPerformers.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    encore: boolean("encore").notNull().default(false),
    reaction: songReactionEnum("reaction"),
    note: text("note"),
  },
  (t) => [index("live_show_songs_slot_idx").on(t.slotId, t.position)],
);

export const watchlistKindEnum = pgEnum("watchlist_kind", ["movie", "tv", "performer", "festival"]);

/**
 * Things a user wants to watch or see live. Movies/shows point at `titles`,
 * artists at `performers`; festivals have no catalog, so their details live inline.
 */
export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    uniqueIndex("watchlist_user_title_idx").on(t.userId, t.titleId).where(sql`${t.titleId} IS NOT NULL`),
    uniqueIndex("watchlist_user_performer_idx").on(t.userId, t.performerId).where(sql`${t.performerId} IS NOT NULL`),
    uniqueIndex("watchlist_user_festival_idx")
      .on(t.userId, sql`lower(${t.festivalName})`)
      .where(sql`${t.festivalName} IS NOT NULL`),
  ],
);

export const watchlistItemsRelations = relations(watchlistItems, ({ one }) => ({
  title: one(titles, { fields: [watchlistItems.titleId], references: [titles.id] }),
  performer: one(performers, { fields: [watchlistItems.performerId], references: [performers.id] }),
}));

export const titleEntriesRelations = relations(titleEntries, ({ one }) => ({
  title: one(titles, { fields: [titleEntries.titleId], references: [titles.id] }),
  user: one(users, { fields: [titleEntries.userId], references: [users.id] }),
}));

export const liveShowsRelations = relations(liveShows, ({ one, many }) => ({
  user: one(users, { fields: [liveShows.userId], references: [users.id] }),
  venue: one(venues, { fields: [liveShows.venueId], references: [venues.id] }),
  lineup: many(liveShowPerformers),
}));

export const liveShowPerformersRelations = relations(liveShowPerformers, ({ one, many }) => ({
  show: one(liveShows, { fields: [liveShowPerformers.showId], references: [liveShows.id] }),
  performer: one(performers, { fields: [liveShowPerformers.performerId], references: [performers.id] }),
  songs: many(liveShowSongs),
}));

export const liveShowSongsRelations = relations(liveShowSongs, ({ one }) => ({
  slot: one(liveShowPerformers, { fields: [liveShowSongs.slotId], references: [liveShowPerformers.id] }),
}));

/** A pending friend request. Accepting it deletes the row and creates the friendship. */
export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("friend_requests_pair_idx").on(t.fromUserId, t.toUserId),
    index("friend_requests_to_idx").on(t.toUserId, t.createdAt),
  ],
);

/** Mutual friendships, stored as two rows per pair so "my friends" is a single indexed lookup. */
export const friendships = pgTable(
  "friendships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.friendId] })],
);

/** Blocks hide both people from each other everywhere. The blocked person isn't told. */
export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index("blocks_blocked_idx").on(t.blockedId)],
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
      .references(() => users.id, { onDelete: "cascade" }),
    titleEntryId: uuid("title_entry_id").references(() => titleEntries.id, { onDelete: "cascade" }),
    liveShowId: uuid("live_show_id").references(() => liveShows.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name"),
    confirmed: boolean("confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("companions_entry_idx").on(t.titleEntryId),
    index("companions_show_idx").on(t.liveShowId),
    index("companions_friend_idx").on(t.friendId, t.confirmed),
    uniqueIndex("companions_entry_friend_idx").on(t.titleEntryId, t.friendId),
    uniqueIndex("companions_show_friend_idx").on(t.liveShowId, t.friendId),
    check("companions_one_target", sql`num_nonnulls(${t.titleEntryId}, ${t.liveShowId}) = 1`),
    check("companions_one_person", sql`num_nonnulls(${t.friendId}, ${t.name}) = 1`),
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
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
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
  (t) => [index("reports_status_idx").on(t.status, t.createdAt)],
);

/** One-time codes for "forgot password". Only an HMAC of the code is stored; one live code per user. */
export const passwordResetCodes = pgTable("password_reset_codes", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
