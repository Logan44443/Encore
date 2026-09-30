import type { MediaType } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { api } from "@/api";
import { PosterRow } from "@/components/Poster";
import { Button, Chip, Empty, ErrorText, H1, Loading, Muted, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function Discover() {
  const params = useLocalSearchParams<{ type?: string }>();
  const router = useRouter();
  const type: MediaType = params.type === "tv" ? "tv" : "movie";
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const health = useQuery({ queryKey: ["health"], queryFn: () => api.health(), staleTime: Infinity });
  const results = useQuery({
    queryKey: query ? ["search", type, query] : ["trending", type],
    queryFn: () => (query ? api.catalog.search(type, query) : api.catalog.trending(type)),
    staleTime: query ? 5 * 60_000 : 60_000,
  });
  const topRated = useQuery({
    queryKey: ["top-rated", type],
    queryFn: () => api.catalog.topRated(type),
    enabled: !query,
    staleTime: 60_000,
  });

  return (
    <Screen>
      <H1>Discover</H1>
      <Muted>Find something you watched and rank it.</Muted>
      {health.data?.providers.tmdb === "demo" && (
        <Muted>Demo catalog: 46 popular titles. Add a TMDB key to unlock every movie and show.</Muted>
      )}
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}
        placeholder={type === "movie" ? "Search movies…" : "Search TV shows…"}
        placeholderTextColor={colors.muted}
        value={q}
        onChangeText={setQ}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Movies" active={type === "movie"} onPress={() => router.setParams({ type: "movie" })} />
        <Chip label="TV" active={type === "tv"} onPress={() => router.setParams({ type: "tv" })} />
      </View>
      <Button label="Picks by genre" tone="ghost" onPress={() => router.push(`/picks?type=${type}`)} />
      <ErrorText error={results.error} />
      {results.isLoading ? (
        <Loading />
      ) : results.data?.results.length ? (
        <>
          <Muted>{query ? "Results" : "Trending"}</Muted>
          <PosterRow
            items={results.data.results}
            badgeFor={(item) => ("community" in item && item.community ? String(item.community.recentLogs) : undefined)}
          />
        </>
      ) : (
        <Empty title="No matches" body="Try another title." />
      )}
      {!query && topRated.data && topRated.data.results.length > 0 && (
        <>
          <Muted>Top rated</Muted>
          <PosterRow
            items={topRated.data.results}
            badgeFor={(item) => ("community" in item && item.community ? item.community.avgScore.toFixed(1) : undefined)}
          />
        </>
      )}
      {/* Required by TMDB's API terms wherever their data is shown. */}
      <Muted>This product uses the TMDB API but is not endorsed or certified by TMDB.</Muted>
    </Screen>
  );
}
