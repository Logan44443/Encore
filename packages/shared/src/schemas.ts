import { z } from "zod";
import { MEDIA_TYPES, PERFORMER_ROLES, SHOW_KINDS, SONG_REACTIONS, TIERS } from "./constants";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const registerSchema = z.object({
  email: z.email().max(254),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "3–24 characters: letters, numbers, underscores"),
  displayName: z.string().trim().min(1).max(60).optional(),
  password: z.string().min(8).max(200),
  /** Device region at sign-up; ignored if not a valid code. */
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().catch(undefined),
});

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use a two-letter country code");

/**
 * manual: true when the user picked it; false when it comes from the device region.
 * Device syncs don't override a manual pick unless reset is set ("use my phone's region").
 */
export const updateCountrySchema = z.object({
  country: countryCodeSchema,
  manual: z.boolean(),
  reset: z.boolean().optional(),
});

export const loginSchema = z.object({
  login: z.string().trim().min(1),
  password: z.string().min(1),
});

export const mediaTypeSchema = z.enum(MEDIA_TYPES);
export const tierSchema = z.enum(TIERS);

export const episodeRefSchema = z.object({
  season: z.number().int().min(0),
  episode: z.number().int().min(1),
  name: z.string().max(300),
});

export const createEntrySchema = z.object({
  mediaType: mediaTypeSchema,
  tmdbId: z.number().int().positive(),
  genreId: z.number().int(),
  tier: tierSchema,
  /** Entry that should sit directly above the new one; null = top of the list. */
  aboveEntryId: z.uuid().nullable(),
  review: optionalText(5000),
  favoriteEpisode: episodeRefSchema.nullish(),
  leastFavoriteEpisode: episodeRefSchema.nullish(),
  watchedAt: isoDate.nullish(),
});

export const updateEntrySchema = createEntrySchema
  .pick({ review: true, favoriteEpisode: true, leastFavoriteEpisode: true, watchedAt: true })
  .partial();

export const rerankEntrySchema = z.object({
  genreId: z.number().int(),
  tier: tierSchema,
  aboveEntryId: z.uuid().nullable(),
});

/** Rank one season of a show against the other seasons of that same show. */
export const createSeasonEntrySchema = z.object({
  tmdbId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0).max(200),
  tier: tierSchema,
  /** Season entry that should sit directly above the new one; null = top of that tier. */
  aboveEntryId: z.uuid().nullable(),
});

export const rerankSeasonEntrySchema = z.object({
  tier: tierSchema,
  aboveEntryId: z.uuid().nullable(),
});

export const dismissTitleSchema = z.object({
  mediaType: mediaTypeSchema,
  tmdbId: z.number().int().positive(),
  genreIds: z.array(z.number().int()).max(20).default([]),
});

export const liveSongSchema = z.object({
  title: z.string().trim().min(1).max(300),
  encore: z.boolean().default(false),
  reaction: z.enum(SONG_REACTIONS).nullable().default(null),
  note: optionalText(500),
});

/** A performer from MusicBrainz (mbid set) or typed in manually (mbid null). */
export const performerRefSchema = z.object({
  mbid: z.uuid().nullish(),
  name: z.string().trim().min(1).max(300),
  disambiguation: z.string().max(300).nullish(),
  country: z.string().max(10).nullish(),
  type: z.string().max(50).nullish(),
  imageUrl: z.url().max(1000).nullish(),
});

export const venueInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  city: optionalText(200),
  region: optionalText(200),
  country: optionalText(100),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  setlistFmId: optionalText(50),
});

export const lineupSlotSchema = z.object({
  performer: performerRefSchema,
  role: z.enum(PERFORMER_ROLES).default("support"),
  songs: z.array(liveSongSchema).max(150).default([]),
});

export const createLiveShowSchema = z.object({
  kind: z.enum(SHOW_KINDS).default("concert"),
  /** Festival or production name, e.g. "Glastonbury 2025" or "Hamilton". */
  name: optionalText(200),
  date: isoDate,
  venue: venueInputSchema.nullish(),
  tourName: optionalText(300),
  setlistFmId: optionalText(50),
  rating: z.number().min(0).max(10).multipleOf(0.5).nullish(),
  liked: optionalText(5000),
  disliked: optionalText(5000),
  notes: optionalText(5000),
  lineup: z.array(lineupSlotSchema).min(1, "Add at least one performer").max(60),
});

export const updateLiveShowSchema = createLiveShowSchema.partial();

const watchNote = optionalText(500);

export const addWatchlistSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("movie"), tmdbId: z.number().int().positive(), note: watchNote }),
  z.object({ kind: z.literal("tv"), tmdbId: z.number().int().positive(), note: watchNote }),
  z.object({ kind: z.literal("performer"), performer: performerRefSchema, note: watchNote }),
  z.object({
    kind: z.literal("festival"),
    name: z.string().trim().min(1).max(200),
    date: isoDate.nullish(),
    city: optionalText(200),
    country: optionalText(100),
    note: watchNote,
  }),
]);

export const updateWatchlistSchema = z.object({
  note: watchNote,
  name: z.string().trim().min(1).max(200).optional(),
  date: isoDate.nullish(),
  city: optionalText(200),
  country: optionalText(100),
});

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type EpisodeRef = z.infer<typeof episodeRefSchema>;
export type CreateEntryInput = z.input<typeof createEntrySchema>;
export type UpdateEntryInput = z.input<typeof updateEntrySchema>;
export type RerankEntryInput = z.input<typeof rerankEntrySchema>;
export type CreateSeasonEntryInput = z.input<typeof createSeasonEntrySchema>;
export type RerankSeasonEntryInput = z.input<typeof rerankSeasonEntrySchema>;
export type DismissTitleInput = z.input<typeof dismissTitleSchema>;
export type UpdateCountryInput = z.input<typeof updateCountrySchema>;
export type LiveSongInput = z.input<typeof liveSongSchema>;
export type PerformerRef = z.input<typeof performerRefSchema>;
export type VenueInput = z.input<typeof venueInputSchema>;
export type LineupSlotInput = z.input<typeof lineupSlotSchema>;
export type CreateLiveShowInput = z.input<typeof createLiveShowSchema>;
export type UpdateLiveShowInput = z.input<typeof updateLiveShowSchema>;
export type AddWatchlistInput = z.input<typeof addWatchlistSchema>;
export type UpdateWatchlistInput = z.input<typeof updateWatchlistSchema>;
