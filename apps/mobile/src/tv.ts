import type { QueryClient } from "@tanstack/react-query";

/** Refetch everything that shows TV scores after a show, season or episode ranking changes. */
export function invalidateTv(queryClient: QueryClient, tmdbId: number) {
  queryClient.invalidateQueries({ queryKey: ["tv"] });
  queryClient.invalidateQueries({ queryKey: ["seasons", tmdbId] });
  queryClient.invalidateQueries({ queryKey: ["episodes", tmdbId] });
}

/** "Season 2", or "Specials" / a season's own name when it has one. */
export function seasonName(seasonNumber: number, name: string) {
  if (seasonNumber === 0) return name || "Specials";
  return name && !/^season\s+\d+$/i.test(name) ? `S${seasonNumber} · ${name}` : `Season ${seasonNumber}`;
}

export function episodeCode(seasonNumber: number, episodeNumber: number) {
  return `S${seasonNumber}E${episodeNumber}`;
}
