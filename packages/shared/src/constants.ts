export const MEDIA_TYPES = ["movie", "tv"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const TIERS = ["liked", "fine", "disliked"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Each sentiment tier owns a slice of the 0–10 scale. Position inside the
 * (user, media type, genre, tier) list decides where in that slice a title lands.
 * Ranges never overlap, so a "liked" title always outscores a "fine" one.
 */
export const TIER_RANGES: Record<Tier, { min: number; max: number }> = {
  liked: { min: 6.8, max: 10 },
  fine: { min: 3.5, max: 6.7 },
  disliked: { min: 0, max: 3.4 },
};

/**
 * While a genre + tier list holds fewer than this many other titles, you set the
 * new title's score yourself with a slider instead of answering comparisons.
 */
export const SET_SCORE_BELOW = 2;

export const TIER_LABELS: Record<Tier, string> = {
  liked: "I liked it",
  fine: "It was fine",
  disliked: "I didn't like it",
};

export const SONG_REACTIONS = ["loved", "liked", "disliked"] as const;
export type SongReaction = (typeof SONG_REACTIONS)[number];

export const SHOW_KINDS = ["concert", "festival", "dj_set", "theatre", "comedy", "other"] as const;
export type ShowKind = (typeof SHOW_KINDS)[number];

export const SHOW_KIND_LABELS: Record<ShowKind, string> = {
  concert: "Concert",
  festival: "Festival",
  dj_set: "DJ set",
  theatre: "Theatre / Musical",
  comedy: "Comedy",
  other: "Other live show",
};

export const WATCHLIST_KINDS = ["movie", "tv", "performer", "festival"] as const;
export type WatchlistKind = (typeof WATCHLIST_KINDS)[number];

export const WATCHLIST_KIND_LABELS: Record<WatchlistKind, string> = {
  movie: "Movies",
  tv: "TV shows",
  performer: "Artists",
  festival: "Festivals",
};

export const PERFORMER_ROLES = ["headliner", "support", "guest"] as const;
export type PerformerRole = (typeof PERFORMER_ROLES)[number];

export interface Genre {
  id: number;
  name: string;
}

/** TMDB genre ids — stable across the TMDB API and used as our genre keys. */
export const MOVIE_GENRES: Genre[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

export const TV_GENRES: Genre[] = [
  { id: 10759, name: "Action & Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 10762, name: "Kids" },
  { id: 9648, name: "Mystery" },
  { id: 10763, name: "News" },
  { id: 10764, name: "Reality" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10766, name: "Soap" },
  { id: 10767, name: "Talk" },
  { id: 10768, name: "War & Politics" },
  { id: 37, name: "Western" },
];

export function genresFor(mediaType: MediaType): Genre[] {
  return mediaType === "movie" ? MOVIE_GENRES : TV_GENRES;
}

export function genreName(mediaType: MediaType, id: number): string {
  return genresFor(mediaType).find((g) => g.id === id)?.name ?? "Other";
}

export const PROFILE_VISIBILITIES = ["private", "friends", "public"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export const PROFILE_VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  private: "Only me",
  friends: "Friends",
  public: "Everyone on Encore",
};

export const REPORT_REASONS = ["spam", "harassment", "hate", "sexual", "impersonation", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment or bullying",
  hate: "Hate speech",
  sexual: "Sexual content",
  impersonation: "Pretending to be someone else",
  other: "Something else",
};

export const REPORT_KINDS = ["user", "review", "show_note"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
