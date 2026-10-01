import type { Genre, MediaType, PerformerRole, ProfileVisibility, ShowKind, SongReaction, Tier, WatchlistKind } from "./constants";
import type { EpisodeRef } from "./schemas";

export interface User {
  id: string;
  username: string;
  displayName: string;
  /** Only ever sent to the account's owner. */
  email: string;
  /** ISO 3166-1 alpha-2 code used for streaming availability, e.g. "US". */
  country: string | null;
  /** True once the user picked a country; until then it follows the device region. */
  countryManual: boolean;
  /** Streaming services the user pays for, as TMDB provider ids ("My services"). */
  services: number[];
  privacy: PrivacySettings;
}

export interface PrivacySettings {
  /** Who can see rankings, scores and live shows. */
  profileVisibility: ProfileVisibility;
  /** Friends also see reviews and show notes. Nobody else ever does. */
  shareReviews: boolean;
  /** Appears in people search. */
  searchable: boolean;
  allowFriendRequests: boolean;
  /** Friends can say they watched something with you. */
  allowTags: boolean;
}

/**
 * Someone you watched a title or show with. Friends have `user`; people not on
 * Encore have only a `name`, which nobody but the author sees. A friend's tag is
 * `confirmed` once they accept it, and only then shows to anyone but the two of you.
 */
export interface Companion {
  id: string;
  user: PublicUser | null;
  name: string | null;
  confirmed: boolean;
}

/** A friend said you watched something together and is waiting for you to confirm. */
export interface PendingTag {
  id: string;
  by: PublicUser;
  /** Set for movies and series. */
  title: TitleSummary | null;
  /** Set for live shows. */
  show: { id: string; name: string; date: string; venue: string | null } | null;
  /** When they watched it (the entry's watched date or the show date). */
  date: string | null;
  createdAt: string;
}

/**
 * How the signed-in viewer relates to someone: themselves, a friend, a request
 * they sent ("requested") or one waiting for them to answer ("incoming").
 */
export type Relationship = "self" | "friend" | "requested" | "incoming" | "none";

/** Someone in search results or a list of people, with where you stand with them. */
export interface Person extends PublicUser {
  relationship: Relationship;
}

export interface FriendRequest {
  id: string;
  user: PublicUser;
  createdAt: string;
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
  /** Your services that stream it (or show it free) in your country; empty if none or unknown. */
  onServices: WatchProvider[];
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
  /** Who you watched it with. Only filled where it was asked for (your own lists, profiles). */
  companions?: Companion[];
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
  /** Who you watched it with. Only filled where it was asked for (your own lists, profiles). */
  companions?: Companion[];
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
  relationship: Relationship;
  /** The pending request between you, when relationship is "requested" or "incoming". */
  requestId: string | null;
  /** False when their privacy settings hide their rankings from you; the lists below are then empty. */
  canView: boolean;
  /** Whether they take friend requests from you. */
  canRequest: boolean;
  stats: ProfileStats;
  topMovies: Entry[];
  topShows: Entry[];
  recentLiveShows: LiveShow[];
}

export interface ProviderStatus {
  tmdb: "live" | "demo";
  setlistFm: boolean;
}
