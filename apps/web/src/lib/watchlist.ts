"use client";

import type { AddWatchlistInput, MediaType, WatchlistItem } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

/** Every watchlist item for the signed-in user; shared by the page and every bookmark button. */
export function useWatchlist() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["watchlist", user?.id],
    queryFn: () => api.watchlist.list(),
    enabled: Boolean(user),
    staleTime: 30_000,
  });
}

/** Lookup of watchlisted titles: "movie:27205" → item. */
export function useWatchlistTitles() {
  const { data } = useWatchlist();
  return useMemo(() => {
    const map = new Map<string, WatchlistItem>();
    for (const item of data?.items ?? []) if (item.title) map.set(`${item.kind}:${item.title.tmdbId}`, item);
    return map;
  }, [data]);
}

export function useWatchlistMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    queryClient.invalidateQueries({ queryKey: ["title"] });
  };
  const add = useMutation({ mutationFn: (body: AddWatchlistInput) => api.watchlist.add(body), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api.watchlist.remove(id), onSuccess: invalidate });
  return { add, remove };
}

export function useToggleTitle(mediaType: MediaType, tmdbId: number) {
  const items = useWatchlistTitles();
  const { add, remove } = useWatchlistMutations();
  const item = items.get(`${mediaType}:${tmdbId}`);
  return {
    saved: Boolean(item),
    pending: add.isPending || remove.isPending,
    toggle: () => (item ? remove.mutate(item.id) : add.mutate({ kind: mediaType, tmdbId })),
  };
}
