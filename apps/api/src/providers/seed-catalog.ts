import { genresFor, type Episode, type MediaType, type Region, type SearchResult, type Title } from "@encore/shared";
import type { CatalogProvider } from "./catalog";
import posters from "./seed-posters.json";

/**
 * Offline demo catalog used when no TMDB credentials are configured. IDs are real
 * TMDB ids, so entries created in demo mode line up once a key is added.
 */
type SeedMovie = [tmdbId: number, name: string, year: number, genreIds: number[]];
type SeedShow = [tmdbId: number, name: string, year: number, genreIds: number[], episodesPerSeason: number[]];

export const SEED_MOVIES: SeedMovie[] = [
  [27205, "Inception", 2010, [28, 878, 12]],
  [155, "The Dark Knight", 2008, [28, 80, 18, 53]],
  [157336, "Interstellar", 2014, [12, 18, 878]],
  [496243, "Parasite", 2019, [35, 53, 18]],
  [680, "Pulp Fiction", 1994, [53, 80]],
  [238, "The Godfather", 1972, [18, 80]],
  [550, "Fight Club", 1999, [18, 53]],
  [807, "Se7en", 1995, [80, 9648, 53]],
  [274, "The Silence of the Lambs", 1991, [80, 18, 53]],
  [210577, "Gone Girl", 2014, [9648, 53, 18]],
  [146233, "Prisoners", 2013, [18, 53, 80]],
  [1949, "Zodiac", 2007, [80, 18, 9648, 53]],
  [419430, "Get Out", 2017, [9648, 53, 27]],
  [493922, "Hereditary", 2018, [27, 9648, 53]],
  [694, "The Shining", 1980, [27, 53]],
  [603, "The Matrix", 1999, [28, 878]],
  [438631, "Dune", 2021, [878, 12]],
  [76341, "Mad Max: Fury Road", 2015, [28, 12, 878]],
  [872585, "Oppenheimer", 2023, [18, 36]],
  [244786, "Whiplash", 2014, [18, 10402]],
  [313369, "La La Land", 2016, [35, 18, 10749, 10402]],
  [546554, "Knives Out", 2019, [35, 80, 9648]],
  [8363, "Superbad", 2007, [35]],
  [346698, "Barbie", 2023, [35, 12]],
  [545611, "Everything Everywhere All at Once", 2022, [28, 12, 878]],
  [129, "Spirited Away", 2001, [16, 10751, 14]],
  [862, "Toy Story", 1995, [16, 12, 10751, 35]],
];

export const SEED_SHOWS: SeedShow[] = [
  [1396, "Breaking Bad", 2008, [18, 80], [7, 13, 13, 13, 16]],
  [60059, "Better Call Saul", 2015, [80, 18], [10, 10, 10, 10, 10, 13]],
  [1398, "The Sopranos", 1999, [18, 80], [13, 13, 13, 13, 13, 21]],
  [1438, "The Wire", 2002, [80, 18], [13, 12, 12, 13, 10]],
  [46648, "True Detective", 2014, [18, 80, 9648], [8, 8, 8, 6]],
  [67744, "Mindhunter", 2017, [80, 18], [10, 9]],
  [69740, "Ozark", 2017, [80, 18], [10, 10, 10, 14]],
  [1399, "Game of Thrones", 2011, [10765, 18, 10759], [10, 10, 10, 10, 10, 10, 7, 6]],
  [66732, "Stranger Things", 2016, [18, 10765, 9648], [8, 9, 8, 9]],
  [95396, "Severance", 2022, [18, 9648, 10765], [9, 10]],
  [100088, "The Last of Us", 2023, [18, 10765], [9, 7]],
  [76331, "Succession", 2018, [18], [10, 10, 9, 10]],
  [111803, "The White Lotus", 2021, [35, 18, 9648], [6, 7, 8]],
  [136315, "The Bear", 2022, [18, 35], [8, 10, 10]],
  [2316, "The Office", 2005, [35], [6, 22, 25, 19, 28, 26, 26, 24, 25]],
  [1668, "Friends", 1994, [35, 18], [24, 24, 25, 24, 24, 25, 24, 24, 24, 18]],
  [1400, "Seinfeld", 1989, [35], [5, 12, 23, 24, 22, 24, 24, 22, 24]],
  [67070, "Fleabag", 2016, [35, 18], [6, 6]],
  [97546, "Ted Lasso", 2020, [35, 18], [10, 12, 12]],
];

function movieTitle([tmdbId, name, year, genreIds]: SeedMovie): Title {
  return build("movie", tmdbId, name, year, genreIds, []);
}

function showTitle([tmdbId, name, year, genreIds, seasons]: SeedShow): Title {
  return build(
    "tv",
    tmdbId,
    name,
    year,
    genreIds,
    seasons.map((count, i) => ({ seasonNumber: i + 1, name: `Season ${i + 1}`, episodeCount: count })),
  );
}

function build(
  mediaType: MediaType,
  tmdbId: number,
  name: string,
  year: number,
  genreIds: number[],
  seasons: Title["seasons"],
): Title {
  const all = genresFor(mediaType);
  return {
    tmdbId,
    mediaType,
    name,
    year,
    posterUrl: (posters as Record<string, string>)[`${mediaType}:${tmdbId}`] ?? null,
    backdropUrl: null,
    overview: "Demo catalog entry. Add a TMDB API key to load the full catalog with synopses and backdrops.",
    genres: genreIds.map((id) => all.find((g) => g.id === id)!).filter(Boolean),
    seasons,
  };
}

const titles: Title[] = [...SEED_MOVIES.map(movieTitle), ...SEED_SHOWS.map(showTitle)];

const toResult = (t: Title): SearchResult => ({
  tmdbId: t.tmdbId,
  mediaType: t.mediaType,
  name: t.name,
  year: t.year,
  posterUrl: t.posterUrl,
  overview: t.overview,
  genreIds: t.genres.map((g) => g.id),
  voteAverage: null,
});

const DEMO_REGIONS: Region[] = [
  ["AU", "Australia"],
  ["BR", "Brazil"],
  ["CA", "Canada"],
  ["DE", "Germany"],
  ["ES", "Spain"],
  ["FR", "France"],
  ["GB", "United Kingdom"],
  ["IN", "India"],
  ["IT", "Italy"],
  ["JP", "Japan"],
  ["MX", "Mexico"],
  ["NL", "Netherlands"],
  ["NZ", "New Zealand"],
  ["SG", "Singapore"],
  ["US", "United States"],
].map(([code, name]) => ({ code, name }));

export const seedCatalog: CatalogProvider = {
  kind: "demo",
  source: "demo",

  async verify() {},

  async topInGenre(type, genreId) {
    return titles.filter((t) => t.mediaType === type && t.genres.some((g) => g.id === genreId)).map(toResult);
  },

  async popularInGenre(type, genreId) {
    return titles
      .filter((t) => t.mediaType === type && t.genres.some((g) => g.id === genreId))
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
      .map(toResult);
  },

  async similar(type, tmdbId) {
    const base = titles.find((t) => t.mediaType === type && t.tmdbId === tmdbId);
    if (!base) return [];
    const ids = new Set(base.genres.map((g) => g.id));
    return titles
      .filter((t) => t.mediaType === type && t.tmdbId !== tmdbId)
      .map((t) => ({ t, overlap: t.genres.filter((g) => ids.has(g.id)).length }))
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .map((x) => toResult(x.t));
  },

  async search(type, query) {
    const q = query.toLowerCase();
    return titles.filter((t) => t.mediaType === type && t.name.toLowerCase().includes(q)).map(toResult);
  },

  async trending(type) {
    return titles.filter((t) => t.mediaType === type).map(toResult);
  },

  async watchProviders() {
    return {};
  },

  async regions() {
    return DEMO_REGIONS;
  },

  async details(type, tmdbId) {
    return titles.find((t) => t.mediaType === type && t.tmdbId === tmdbId) ?? null;
  },

  async season(tvId, season) {
    const show = titles.find((t) => t.mediaType === "tv" && t.tmdbId === tvId);
    const count = show?.seasons.find((s) => s.seasonNumber === season)?.episodeCount ?? 0;
    return Array.from(
      { length: count },
      (_, i): Episode => ({ season, episode: i + 1, name: `Episode ${i + 1}`, airDate: null, stillUrl: null }),
    );
  },
};
