import type { MediaType, Tier, WatchlistKind } from "./constants";
import type {
  AddWatchlistInput,
  UpdateWatchlistInput,
  CreateEntryInput,
  CreateLiveShowInput,
  CreateSeasonEntryInput,
  DeleteAccountInput,
  DismissTitleInput,
  LoginInput,
  RegisterInput,
  RerankEntryInput,
  RerankSeasonEntryInput,
  UpdateCountryInput,
  UpdateEntryInput,
  UpdateLiveShowInput,
} from "./schemas";
import type { PasswordResetConfirmInput, PasswordResetRequestInput } from "./password-reset";
import type {
  AuthResponse,
  DiscoverResult,
  Entry,
  EntryResult,
  Episode,
  Feed,
  GenreRecommendations,
  GenreSummary,
  LiveShow,
  Performer,
  Profile,
  ProviderStatus,
  RankCandidate,
  Region,
  SeasonEntry,
  SeasonEntryResult,
  SeasonRankCandidate,
  SearchResult,
  SetlistSummary,
  Title,
  User,
  WatchlistItem,
  WatchProviders,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Called per request so web (localStorage) and native (SecureStore) can supply tokens. */
  getToken?: () => string | null | Promise<string | null>;
  fetch?: typeof fetch;
  /** Abort requests that take longer than this (default 20s) so screens never spin forever. */
  timeoutMs?: number;
  /** Called with the rejected token when a signed-in request comes back 401 (expired or revoked session). */
  onUnauthorized?: (token: string) => void;
}

type Query = Record<string, string | number | undefined | null>;

/**
 * Platform-agnostic, typed client for the Encore API. Uses only `fetch`, so the
 * same code runs in the browser, React Native, and Node.
 */
export function createApiClient({
  baseUrl,
  getToken,
  fetch: fetchImpl = fetch,
  timeoutMs = 20_000,
  onUnauthorized,
}: ApiClientOptions) {
  async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
    const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = await getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    // AbortController + setTimeout rather than AbortSignal.timeout, which React Native lacks.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) throw new ApiError(0, "The server took too long to respond. Try again.");
      throw new ApiError(0, "Can't reach Encore. Check your connection and try again.", err);
    } finally {
      clearTimeout(timer);
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.status === 401 && token) onUnauthorized?.(token);
    if (!res.ok) {
      throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? res.statusText, data);
    }
    return data as T;
  }

  const p = (path: string) => path.replace(/^\//, "");

  return {
    health: () => request<{ ok: true; providers: ProviderStatus }>("GET", p("/health")),

    auth: {
      register: (body: RegisterInput) => request<AuthResponse>("POST", p("/auth/register"), { body }),
      login: (body: LoginInput) => request<AuthResponse>("POST", p("/auth/login"), { body }),
      me: () => request<{ user: User }>("GET", p("/auth/me")),
      setCountry: (body: UpdateCountryInput) => request<{ user: User }>("PUT", p("/auth/me/country"), { body }),
    },

    passwordReset: {
      /** Emails a one-time code if the address has an account; responds the same either way. */
      request: (body: PasswordResetRequestInput) => request<{ ok: true }>("POST", p("/auth/password-reset/request"), { body }),
      /** Sets the new password and signs out every existing session. Sign in afterwards. */
      confirm: (body: PasswordResetConfirmInput) => request<{ ok: true }>("POST", p("/auth/password-reset/confirm"), { body }),
    },

    catalog: {
      search: (type: MediaType, q: string) =>
        request<{ results: SearchResult[] }>("GET", p("/catalog/search"), { query: { type, q } }),
      /** What Encore users are logging and rating highly right now, topped up with TMDB trending. */
      trending: (type: MediaType) =>
        request<{ results: DiscoverResult[] }>("GET", p("/catalog/trending"), { query: { type } }),
      /** Best community scores (Bayesian-weighted so a single 10/10 can't top the chart). */
      topRated: (type: MediaType) =>
        request<{ results: DiscoverResult[] }>("GET", p("/catalog/top-rated"), { query: { type } }),
      genres: (type: MediaType) =>
        request<{ genres: GenreSummary[] }>("GET", p("/catalog/genres"), { query: { type } }),
      recommendations: (type: MediaType, genreId: number) =>
        request<GenreRecommendations>("GET", p("/catalog/recommendations"), { query: { type, genreId } }),
      title: (type: MediaType, tmdbId: number) =>
        request<{ title: Title; myEntry: Entry | null; watchlistItemId: string | null }>(
          "GET",
          p(`/catalog/${type}/${tmdbId}`),
        ),
      season: (tmdbId: number, season: number) =>
        request<{ episodes: Episode[] }>("GET", p(`/catalog/tv/${tmdbId}/season/${season}`)),
      /** Streaming, rent and buy options in one country; null when there's no data. */
      providers: (type: MediaType, tmdbId: number, country: string) =>
        request<{ providers: WatchProviders | null }>("GET", p(`/catalog/${type}/${tmdbId}/providers`), { query: { country } }),
      /** Countries with streaming data, for the country picker. */
      regions: () => request<{ regions: Region[] }>("GET", p("/catalog/regions")),
      /** Personal "Recommended for you" feed across movies and TV (signed in only). */
      feed: () => request<Feed>("GET", p("/catalog/feed")),
      /** "Not interested": hides the title and weakens similar picks. */
      dismiss: (body: DismissTitleInput) => request<null>("POST", p("/catalog/feed/dismiss"), { body }),
      undismiss: (query: { mediaType: MediaType; tmdbId: number }) =>
        request<null>("DELETE", p("/catalog/feed/dismiss"), { query }),
    },

    entries: {
      list: (query: { mediaType?: MediaType; genreId?: number } = {}) =>
        request<{ entries: Entry[] }>("GET", p("/entries"), { query }),
      candidates: (query: { mediaType: MediaType; genreId: number; tier: Tier; excludeEntryId?: string }) =>
        request<{ candidates: RankCandidate[] }>("GET", p("/entries/candidates"), { query }),
      create: (body: CreateEntryInput) => request<EntryResult>("POST", p("/entries"), { body }),
      update: (id: string, body: UpdateEntryInput) =>
        request<{ entry: Entry }>("PATCH", p(`/entries/${id}`), { body }),
      rerank: (id: string, body: RerankEntryInput) =>
        request<EntryResult>("PUT", p(`/entries/${id}/rank`), { body }),
      remove: (id: string) => request<null>("DELETE", p(`/entries/${id}`)),
    },

    seasons: {
      list: (tmdbId: number) =>
        request<{ seasons: SeasonEntry[] }>("GET", p("/entries/seasons"), { query: { tmdbId } }),
      candidates: (query: { tmdbId: number; tier: Tier; excludeEntryId?: string }) =>
        request<{ candidates: SeasonRankCandidate[] }>("GET", p("/entries/seasons/candidates"), { query }),
      create: (body: CreateSeasonEntryInput) => request<SeasonEntryResult>("POST", p("/entries/seasons"), { body }),
      rerank: (id: string, body: RerankSeasonEntryInput) =>
        request<SeasonEntryResult>("PUT", p(`/entries/seasons/${id}/rank`), { body }),
      remove: (id: string) => request<null>("DELETE", p(`/entries/seasons/${id}`)),
    },

    music: {
      searchPerformers: (q: string) =>
        request<{ performers: Performer[] }>("GET", p("/music/performers/search"), { query: { q } }),
      setlists: (mbid: string, query: { date?: string; page?: number } = {}) =>
        request<{ setlists: SetlistSummary[]; enabled: boolean }>("GET", p(`/music/performers/${mbid}/setlists`), {
          query,
        }),
    },

    watchlist: {
      list: (kind?: WatchlistKind) => request<{ items: WatchlistItem[] }>("GET", p("/watchlist"), { query: { kind } }),
      /** Idempotent: adding something already on the list returns the existing item. */
      add: (body: AddWatchlistInput) => request<{ item: WatchlistItem }>("POST", p("/watchlist"), { body }),
      update: (id: string, body: UpdateWatchlistInput) =>
        request<{ item: WatchlistItem }>("PATCH", p(`/watchlist/${id}`), { body }),
      remove: (id: string) => request<null>("DELETE", p(`/watchlist/${id}`)),
    },

    live: {
      list: () => request<{ shows: LiveShow[] }>("GET", p("/live")),
      get: (id: string) => request<{ show: LiveShow }>("GET", p(`/live/${id}`)),
      create: (body: CreateLiveShowInput) => request<{ show: LiveShow }>("POST", p("/live"), { body }),
      update: (id: string, body: UpdateLiveShowInput) =>
        request<{ show: LiveShow }>("PATCH", p(`/live/${id}`), { body }),
      remove: (id: string) => request<null>("DELETE", p(`/live/${id}`)),
    },

    account: {
      /** Permanently deletes the signed-in account and everything it logged. */
      delete: (body: DeleteAccountInput) => request<null>("POST", p("/account/delete"), { body }),
    },

    users: {
      profile: (username: string) => request<Profile>("GET", p(`/users/${username}`)),
      entries: (username: string, mediaType?: MediaType) =>
        request<{ entries: Entry[] }>("GET", p(`/users/${username}/entries`), { query: { mediaType } }),
      liveShows: (username: string) => request<{ shows: LiveShow[] }>("GET", p(`/users/${username}/live`)),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
