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
  /** Friends see what's on your watchlist. */
  shareWatchlist: boolean;
}

/** A friend's ranking of one title, for the title page. */
export interface FriendRanking {
  user: PublicUser;
  entryId: string;
  score: number;
  tier: Tier;
  genreName: string;
  /** Null when they wrote nothing or don't share reviews. */
  review: string | null;
  watchedAt: string | null;
}

export interface FriendsOnTitle {
  /** Highest score first. */
  rankings: FriendRanking[];
  /** Average friends' score, or null when no friend ranked it. */
  average: number | null;
  /** Friends with it on their watchlist. */
  wantToWatch: PublicUser[];
}

/** You and one friend side by side. */
export interface Comparison {
  /** 0–100: how close your scores are on titles you both ranked; null below 3 shared titles. */
  match: number | null;
  /** Titles you both ranked, biggest disagreement first. */
  both: { title: TitleSummary; mine: number; theirs: number }[];
  /** Their best titles you haven't ranked. */
  theyLoved: Entry[];
  /** Your best titles they haven't ranked. */
  youLoved: Entry[];
}

/** Something a friend ranked or saw, for the Home feed. */
export type ActivityItem =
  | { kind: "entry"; user: PublicUser; entry: Entry; at: string }
  | { kind: "show"; user: PublicUser; show: LiveShow; at: string };

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
  show: { id: string; name: string; date: string; venue: string | null; imageUrl: string | null } | null;
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
  | { kind: "popular" }
  /** Friends who scored it highly, best taste match first. */
  | { kind: "friends"; names: string[] };

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

/** One episode of a show, ranked against that show's other episodes (across all its seasons). */
export interface EpisodeEntry {
  id: string;
  tmdbId: number;
  showName: string;
  posterUrl: string | null;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  stillUrl: string | null;
  tier: Tier;
  score: number;
  createdAt: string;
}

/** One slot in a show's (tier) episode list, ordered best → worst. */
export interface EpisodeRankCandidate {
  entryId: string;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  score: number;
}

export interface EpisodeEntryResult {
  entry: EpisodeEntry;
  rank: number;
  outOf: number;
}

/**
 * A season's score: your own ranking of it, or the average of its ranked
 * episodes when you haven't ranked the season itself (see ROLLUP_RULE).
 */
export interface SeasonScore {
  tmdbId: number;
  showName: string;
  posterUrl: string | null;
  seasonNumber: number;
  name: string;
  episodeCount: number;
  score: number;
  /** "ranked" = you ranked the season itself; "episodes" = filled in from its episodes. */
  source: "ranked" | "episodes";
  /** Your direct ranking of the season, if any. */
  entry: SeasonEntry | null;
  episodeAverage: number | null;
  rankedEpisodes: number;
}

/**
 * A show's score: your own ranking of it, or the average of its season scores
 * when you've only ranked seasons or episodes (see ROLLUP_RULE).
 */
export interface ShowScore {
  title: TitleSummary;
  genreId: number;
  genreName: string;
  score: number;
  /** "ranked" = you ranked the show itself; "seasons" = filled in from its seasons. */
  source: "ranked" | "seasons";
  /** Your direct ranking of the show, if any. */
  entry: Entry | null;
  seasonAverage: number | null;
  /** Seasons (not counting specials) with a score, direct or from episodes. */
  rankedSeasons: number;
}

/** Your TV rankings at every level, each list best → worst. */
export interface TvRankings {
  shows: ShowScore[];
  seasons: SeasonScore[];
  episodes: EpisodeEntry[];
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

/** A film from a Letterboxd export that Encore couldn't match to a catalog title by itself. */
export interface LetterboxdUnmatched {
  /** Stable id for this film within the import, for fixing or skipping it. */
  key: string;
  name: string;
  year: number | null;
  /** Letterboxd stars (½ to 5), or null when it wasn't rated. */
  rating: number | null;
  watchedAt: string | null;
  /** "watched" films get ranked (when rated); "watchlist" ones go on the watchlist. */
  kind: "watched" | "watchlist";
}

export interface LetterboxdImportCounts {
  /** Rated films added to your movie rankings. */
  ranked: number;
  /** Films you'd already ranked in Encore; those rankings were left as they are. */
  alreadyRanked: number;
  watchlisted: number;
  /** Watched but never rated on Letterboxd, so there was no score to rank them with. */
  notRated: number;
  unmatched: number;
}

export interface LetterboxdImport {
  status: "running" | "done" | "failed";
  /** Films processed so far, out of `total`. */
  done: number;
  total: number;
  error: string | null;
  counts: LetterboxdImportCounts;
  unmatched: LetterboxdUnmatched[];
  /** Watched-but-unrated films that were matched, to rank by hand. */
  notRated: TitleSummary[];
  startedAt: string;
  finishedAt: string | null;
}
