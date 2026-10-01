import type { DiscoverResult, MediaType, SearchResult } from "@encore/shared";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth";
import { colors } from "../theme";
import { useToggleTitle } from "../watchlist";

export function Poster({ uri, name, width = 108 }: { uri: string | null; name: string; width?: number }) {
  const height = Math.round(width * 1.5);
  if (!uri) {
    return (
      <View style={[styles.fallback, { width, height }]}>
        <Text style={styles.fallbackText} numberOfLines={4}>
          {name}
        </Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={{ width, height, borderRadius: 12, backgroundColor: colors.panel2 }} contentFit="cover" />;
}

export function TitleCard({
  item,
  width = 108,
  badge,
}: {
  item: SearchResult | DiscoverResult;
  width?: number;
  badge?: string;
}) {
  const router = useRouter();
  const community = "community" in item ? item.community : null;
  return (
    <Pressable onPress={() => router.push(`/title/${item.mediaType}/${item.tmdbId}`)} style={{ width }}>
      <View>
        <Poster uri={item.posterUrl} name={item.name} width={width} />
        <Bookmark mediaType={item.mediaType} tmdbId={item.tmdbId} />
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {[item.year, community ? `${community.avgScore.toFixed(1)} avg` : null].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
  );
}

function Bookmark({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const { user } = useAuth();
  const { saved, toggle } = useToggleTitle(mediaType, tmdbId);
  if (!user) return null;
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        toggle();
      }}
      style={styles.bookmark}
    >
      <Text style={{ color: saved ? colors.brand : "white", fontSize: 14 }}>{saved ? "★" : "☆"}</Text>
    </Pressable>
  );
}

export function PosterRow({
  items,
  badgeFor,
  horizontal,
}: {
  items: (SearchResult | DiscoverResult)[];
  badgeFor?: (item: SearchResult | DiscoverResult) => string | undefined;
  /** One swipeable row instead of a wrapping grid. */
  horizontal?: boolean;
}) {
  if (horizontal) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.carousel}>
        {items.map((item) => (
          <TitleCard key={`${item.mediaType}-${item.tmdbId}`} item={item} badge={badgeFor?.(item)} />
        ))}
      </ScrollView>
    );
  }
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <TitleCard key={`${item.mediaType}-${item.tmdbId}`} item={item} badge={badgeFor?.(item)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderRadius: 12,
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  fallbackText: { color: colors.muted, textAlign: "center", fontSize: 12 },
  name: { color: colors.text, marginTop: 6, fontWeight: "600", fontSize: 13 },
  meta: { color: colors.muted, fontSize: 11 },
  badge: { position: "absolute", top: 6, left: 6, backgroundColor: "rgba(11,11,15,0.85)", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: "white", fontSize: 10, fontWeight: "800" },
  bookmark: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(11,11,15,0.85)", borderRadius: 999, width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  // Runs edge to edge past the screen's 16pt padding, while the first poster still lines up with it.
  bleed: { marginHorizontal: -16 },
  carousel: { gap: 12, paddingHorizontal: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
