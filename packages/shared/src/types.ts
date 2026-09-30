import type { Genre, MediaType, PerformerRole, ShowKind, SongReaction, Tier, WatchlistKind } from "./constants";
import type { EpisodeRef } from "./schemas";

export interface User {
  id: string;
  username: string;
  displayName: string;
  /** ISO 3166-1 alpha-2 code used for streaming availability, e.g. "US". */
  country: string | null;
  /** True once the user picked a country; until then it follows the device region. */
  countryManual: boolean;
}

/** What other people can see about a user. */
export type PublicUser = Pick<User, "id" | "username" | "displayName">;

export interface AuthResponse {
  token: string;
  user: User;
}

export interface TitleSummary {
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  year: number | null;
  posterUrl: string | null;
}

export interface SearchResult extends TitleSummary {
  overview: string;
  genreIds: number[];
  /** Critic/audience score from the catalog provider (TMDB, 0–10); null in demo mode. */
  voteAverage: number | null;
}

/** Aggregate activity from Encore users for one title. */
export interface CommunityStats {
  /** Logs in the trending window (last 14 days). */
  recentLogs: number;
  totalLogs: number;
  /** Mean score across all users' rankings, 0–10. */
  avgScore: number;
}

export interface DiscoverResult extends SearchResult {
  community: CommunityStats | null;
}

export interface WatchProvider {
  id: number;
  name: string;
  logoUrl: string | null;
}

/** Where a title can be watched in one country (data from JustWatch via TMDB). */
export interface WatchProviders {
  country: string;
  /** JustWatch page for the title in this country. */
  link: string | null;
  stream: WatchProvider[];
  free: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
}

export interface Region {
  code: string;
  name: string;
}

/** Why a title is in your feed; shown under the poster. */
export type FeedReason =
  | { kind: "similar"; seed: TitleSummary }
  | { kind: "taste"; fans: number }
  | { kind: "genre"; genreName: string }
  | { kind: "watchlist" }
  | { kind: "popular" };

export interface FeedItem {
  title: DiscoverResult;
  reason: FeedReason;
}

export interface Feed {
  items: FeedItem[];
  /** False until you've liked a few titles; the feed is then community picks. */
  personalized: boolean;
}

export interface GenreRecommendations {
  genre: Genre;
  /** Hot in this genre right now: recent Encore activity, topped up with what's popular in the catalog. */
  trending: DiscoverResult[];
  /** Your personal feed narrowed to this genre, with reasons (signed-in users). */
  forYou: FeedItem[];
  /** Highest community-rated titles in the genre that you haven't ranked yet. */
  community: DiscoverResult[];
  /** Picks similar to your top-scored title in this genre (signed-in users with rankings). */
  becauseYouLoved: { title: TitleSummary; score: number; results: DiscoverResult[] } | null;
  /** Critically acclaimed titles in the genre from the catalog provider. */
  acclaimed: DiscoverResult[];
  /** Your own top picks in this genre, for context. */
  yourTop: Entry[];
}

export interface GenreSummary extends Genre {
  /** Titles you've ranked in this genre. */
  yourCount: number;
  /** Titles anyone on Encore has ranked in this genre. */
  communityCount: number;
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
}

export interface Title extends TitleSummary {
  overview: string;
  backdropUrl: string | null;
  genres: Genre[];
  seasons: SeasonSummary[];
}

export interface Episode {
  season: number;
  episode: number;
  name: string;
  airDate: string | null;
  stillUrl: string | null;
}

export interface Entry {
  id: string;
  title: TitleSummary;
  tier: Tier;
  genreId: number;
  genreName: string;
  score: number;
  review: string | null;
  favoriteEpisode: EpisodeRef | null;
  leastFavoriteEpisode: EpisodeRef | null;
  watchedAt: string | null;
  createdAt: string;
}

/** One slot in a (genre, tier) list, ordered best → worst. */
export interface RankCandidate {
  entryId: string;
  title: TitleSummary;
  score: number;
}

export interface EntryResult {
  entry: Entry;
  rank: number;
  outOf: number;
}

/** One season of a show, ranked against that show's other seasons. */
export interface SeasonEntry {
  id: string;
  tmdbId: number;
  showName: string;
  seasonNumber: number;
  name: string;
  episodeCount: number;
  tier: Tier;
  score: number;
  createdAt: string;
}

/** One slot in a show's (tier) season list, ordered best → worst. */
export interface SeasonRankCandidate {
  entryId: string;
  seasonNumber: number;
  name: string;
  score: number;
}

export interface SeasonEntryResult {
  entry: SeasonEntry;
  rank: number;
  outOf: number;
}

export interface Performer {
  /** MusicBrainz id; null for performers added by name only. */
  mbid: string | null;
  name: string;
  disambiguation: string | null;
  country: string | null;
  type: string | null;
  imageUrl: string | null;
}

export interface Venue {
  name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}

export interface SetlistSong {
  title: string;
  encore: boolean;
}

export interface SetlistSummary {
  id: string;
  eventDate: string;
  venue: (Venue & { setlistFmId: string | null }) | null;
  tourName: string | null;
  songs: SetlistSong[];
}

export interface LiveSong {
  position: number;
  title: string;
  encore: boolean;
  reaction: SongReaction | null;
  note: string | null;
}

export interface LineupSlot {
  performer: Performer;
  role: PerformerRole;
  songs: LiveSong[];
}

export interface LiveShow {
  id: string;
  kind: ShowKind;
  name: string | null;
  date: string;
  venue: Venue | null;
  tourName: string | null;
  setlistFmId: string | null;
  rating: number | null;
  liked: string | null;
  disliked: string | null;
  notes: string | null;
  /** Headliner(s) first, then support acts, in billing order. */
  lineup: LineupSlot[];
  createdAt: string;
}

export interface WatchlistFestival {
  name: string;
  date: string | null;
  city: string | null;
  country: string | null;
}

/** Exactly one of `title` / `performer` / `festival` is set, matching `kind`. */
export interface WatchlistItem {
  id: string;
  kind: WatchlistKind;
  note: string | null;
  title: TitleSummary | null;
  performer: Performer | null;
  festival: WatchlistFestival | null;
  createdAt: string;
}

export interface ProfileStats {
  movies: number;
  series: number;
  liveShows: number;
  performers: number;
  cities: number;
}

export interface Profile {
  user: PublicUser;
  stats: ProfileStats;
  topMovies: Entry[];
  topShows: Entry[];
  recentLiveShows: LiveShow[];
}

export interface ProviderStatus {
  tmdb: "live" | "demo";
  setlistFm: boolean;
}
