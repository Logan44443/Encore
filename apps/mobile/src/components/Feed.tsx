import type { Feed, FeedItem, FeedReason } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { colors } from "../theme";
import { Poster } from "./Poster";

export const FEED_KEY = ["feed"] as const;
const keyOf = (i: FeedItem) => `${i.title.mediaType}-${i.title.tmdbId}`;

export function useFeed() {
  return useQuery({ queryKey: FEED_KEY, queryFn: () => api.catalog.feed(), staleTime: 5 * 60_000 });
}

export function reasonText(reason: FeedReason): string {
  switch (reason.kind) {
    case "similar":
      return `Because you loved ${reason.seed.name}`;
    case "taste":
      return reason.fans > 1 ? `Loved by ${reason.fans} people with your taste` : "Popular with people who like what you like";
    case "genre":
      return `Top rated in ${reason.genreName}`;
    case "watchlist":
      return "On your watchlist";
    case "popular":
      return "Popular on Encore";
  }
}

/**
 * "Not interested": removes the title from the cached feed right away and keeps
 * it around briefly so it can be undone.
 */
export function useDismiss() {
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState<{ item: FeedItem; index: number } | null>(null);

  const setItems = (fn: (items: FeedItem[]) => FeedItem[]) =>
    queryClient.setQueryData<Feed>(FEED_KEY, (feed) => (feed ? { ...feed, items: fn(feed.items) } : feed));

  const dismiss = useMutation({
    mutationFn: (item: FeedItem) =>
      api.catalog.dismiss({ mediaType: item.title.mediaType, tmdbId: item.title.tmdbId, genreIds: item.title.genreIds }),
    onMutate: (item) => {
      const index = queryClient.getQueryData<Feed>(FEED_KEY)?.items.findIndex((i) => keyOf(i) === keyOf(item)) ?? 0;
      setItems((items) => items.filter((i) => keyOf(i) !== keyOf(item)));
      setHidden({ item, index });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
  });

  const undo = useMutation({
    mutationFn: (item: FeedItem) => api.catalog.undismiss({ mediaType: item.title.mediaType, tmdbId: item.title.tmdbId }),
    onMutate: (item) => {
      const index = hidden?.index ?? 0;
      setItems((items) => [...items.slice(0, index), item, ...items.slice(index)]);
      setHidden(null);
    },
    onError: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
  });

  return { hidden, dismiss: (item: FeedItem) => dismiss.mutate(item), undo: () => hidden && undo.mutate(hidden.item) };
}

export function FeedCard({ item, width = 132, onDismiss }: { item: FeedItem; width?: number; onDismiss: () => void }) {
  const router = useRouter();
  const { title } = item;
  const community = title.community;
  return (
    <View style={{ width }}>
      <Pressable onPress={() => router.push(`/title/${title.mediaType}/${title.tmdbId}`)}>
        <View>
          <Poster uri={title.posterUrl} name={title.name} width={width} />
          <View style={styles.type}>
            <Text style={styles.typeText}>{title.mediaType === "tv" ? "TV" : "Film"}</Text>
          </View>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {title.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[title.year, community ? `${community.avgScore.toFixed(1)} avg` : null].filter(Boolean).join(" · ")}
        </Text>
        <Text style={styles.reason} numberOfLines={2}>
          {reasonText(item.reason)}
        </Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismiss}>
        <Text style={styles.dismissText}>Not interested</Text>
      </Pressable>
    </View>
  );
}

export function UndoBar({ name, onUndo }: { name: string; onUndo: () => void }) {
  return (
    <View style={styles.undo}>
      <Text style={styles.undoText} numberOfLines={1}>
        Hid {name}. You'll see fewer like it.
      </Text>
      <Pressable onPress={onUndo} hitSlop={8}>
        <Text style={styles.undoAction}>Undo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, marginTop: 6, fontWeight: "700", fontSize: 13 },
  meta: { color: colors.muted, fontSize: 11 },
  reason: { color: colors.brand, fontSize: 11, marginTop: 3, fontWeight: "600", lineHeight: 14 },
  dismiss: { marginTop: 6, alignSelf: "flex-start" },
  dismissText: { color: colors.muted, fontSize: 11, textDecorationLine: "underline" },
  type: { position: "absolute", top: 6, left: 6, backgroundColor: "rgba(11,11,15,0.85)", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  typeText: { color: "white", fontSize: 10, fontWeight: "800" },
  undo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.panel2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  undoText: { color: colors.text, fontSize: 13, flex: 1 },
  undoAction: { color: colors.brand, fontWeight: "800" },
});
