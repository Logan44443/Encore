import type { DiscoverResult, GenreSummary, MediaType, SearchResult } from "@encore/shared";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { FeedCard, UndoBar, useDismiss } from "@/components/Feed";
import { PosterRow } from "@/components/Poster";
import { Chip, Empty, ErrorText, H1, Loading, Muted, Screen, SectionTitle, Segmented } from "@/components/ui";
import { colors } from "@/theme";

type Item = SearchResult | DiscoverResult;

const recentBadge = (item: Item) => ("community" in item && item.community?.recentLogs ? `${item.community.recentLogs} new` : undefined);
const avgBadge = (item: Item) => ("community" in item && item.community ? item.community.avgScore.toFixed(1) : undefined);
const criticBadge = (item: Item) => (item.voteAverage !== null ? item.voteAverage.toFixed(1) : undefined);

export default function Discover() {
  const params = useLocalSearchParams<{ type?: string; genre?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const type: MediaType = params.type === "tv" ? "tv" : "movie";
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const health = useQuery({ queryKey: ["health"], queryFn: () => api.health(), staleTime: Infinity });
  const genres = useQuery({
    queryKey: ["genres", type, user?.id],
    queryFn: () => api.catalog.genres(type),
    staleTime: 5 * 60_000,
  });
  const genreParam = Number(params.genre);
  const genre = genres.data?.genres.find((g) => g.id === genreParam) ?? null;

  return (
    <Screen>
      <H1>Discover</H1>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder={type === "movie" ? "Search movies" : "Search TV shows"}
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          autoCorrect={false}
        />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <Segmented
        options={[
          { value: "movie", label: "Movies" },
          { value: "tv", label: "TV" },
        ]}
        value={type}
        // Genre ids differ between movies and TV, so switching type clears the genre filter.
        onChange={(t) => router.setParams({ type: t, genre: undefined })}
      />
      <GenreFilter
        genres={genres.data?.genres ?? []}
        selected={genre?.id ?? null}
        onSelect={(id) => router.setParams({ genre: id === null ? undefined : String(id) })}
      />
      {health.data?.providers.tmdb === "demo" && <Muted>Demo catalog: add a TMDB key to unlock every movie and show.</Muted>}
      <ErrorText error={genres.error} />

      {params.genre && genres.isLoading ? (
        <Loading />
      ) : query ? (
        <SearchResults type={type} query={query} genre={genre} />
      ) : genre ? (
        <GenreSections type={type} genre={genre} />
      ) : (
        <AllSections type={type} />
      )}

      {/* Required by TMDB's API terms wherever their data is shown. */}
      <Muted>This product uses the TMDB API but is not endorsed or certified by TMDB.</Muted>
    </Screen>
  );
}

function GenreFilter({
  genres,
  selected,
  onSelect,
}: {
  genres: GenreSummary[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chips}>
      <Chip label="All" active={selected === null} onPress={() => onSelect(null)} />
      {genres.map((g) => (
        <Chip key={g.id} label={g.name} active={g.id === selected} onPress={() => onSelect(g.id === selected ? null : g.id)} />
      ))}
    </ScrollView>
  );
}

function SearchResults({ type, query, genre }: { type: MediaType; query: string; genre: GenreSummary | null }) {
  const results = useQuery({
    queryKey: ["search", type, query],
    queryFn: () => api.catalog.search(type, query),
    staleTime: 5 * 60_000,
  });
  if (results.isLoading) return <Loading />;
  if (results.error) return <ErrorText error={results.error} />;
  const all = results.data?.results ?? [];
  const shown = genre ? all.filter((r) => r.genreIds.includes(genre.id)) : all;
  if (!shown.length) {
    return genre && all.length ? (
      <Empty title={`No ${genre.name.toLowerCase()} matches`} body={`${all.length} other result${all.length === 1 ? "" : "s"} outside this genre. Tap All to see them.`} />
    ) : (
      <Empty title="No matches" body="Try another title." />
    );
  }
  return (
    <>
      <SectionTitle children={genre ? `${genre.name} results` : "Results"} />
      <PosterRow items={shown} />
    </>
  );
}

function AllSections({ type }: { type: MediaType }) {
  const trending = useQuery({ queryKey: ["trending", type], queryFn: () => api.catalog.trending(type), staleTime: 60_000 });
  const topRated = useQuery({ queryKey: ["top-rated", type], queryFn: () => api.catalog.topRated(type), staleTime: 60_000 });
  if (trending.isLoading) return <Loading />;
  return (
    <>
      <ErrorText error={trending.error ?? topRated.error} />
      <Section title="Trending this week" items={trending.data?.results} badgeFor={recentBadge} />
      <Section title="Top rated on Encore" items={topRated.data?.results} badgeFor={avgBadge} />
    </>
  );
}

function GenreSections({ type, genre }: { type: MediaType; genre: GenreSummary }) {
  const { user } = useAuth();
  const { hidden, dismiss, undo } = useDismiss();
  const recs = useQuery({
    queryKey: ["recommendations", type, genre.id, user?.id],
    queryFn: () => api.catalog.recommendations(type, genre.id),
  });
  if (recs.isLoading) return <Loading />;
  if (recs.error) return <ErrorText error={recs.error} />;
  const r = recs.data;
  if (!r) return null;
  const name = genre.name.toLowerCase();
  const noun = type === "movie" ? "movies" : "shows";
  const empty = !r.forYou.length && !r.trending.length && !r.community.length && !r.acclaimed.length && !r.becauseYouLoved;

  return (
    <>
      {user && r.forYou.length > 0 && (
        <>
          <SectionTitle children="Picked for you" />
          {hidden ? <UndoBar name={hidden.item.title.name} onUndo={undo} /> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.carousel}>
            {r.forYou.map((item) => (
              <FeedCard key={`${item.title.mediaType}-${item.title.tmdbId}`} item={item} width={108} onDismiss={() => dismiss(item)} />
            ))}
          </ScrollView>
        </>
      )}
      <Section title={`Trending in ${name}`} items={r.trending} badgeFor={recentBadge} />
      {r.becauseYouLoved && <Section title={`Because you loved ${r.becauseYouLoved.title.name}`} items={r.becauseYouLoved.results} />}
      <Section title={`Encore's favourite ${name} ${noun}`} items={r.community} badgeFor={avgBadge} />
      <Section
        title={r.acclaimed.some((t) => t.voteAverage !== null) ? "Critically acclaimed" : `${genre.name} essentials`}
        items={r.acclaimed}
        badgeFor={criticBadge}
      />
      {empty && <Empty title={`Nothing in ${genre.name} yet`} body="Try another genre." />}
    </>
  );
}

/** A titled, swipeable row of posters. Hidden when it has nothing to show. */
function Section({ title, items, badgeFor }: { title: string; items: Item[] | undefined; badgeFor?: (item: Item) => string | undefined }) {
  if (!items?.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle children={title} />
      <PosterRow items={items} badgeFor={badgeFor} horizontal />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 12, fontSize: 16 },
  // Rows run edge to edge past the screen's 16pt padding, while the first item still lines up with it.
  bleed: { marginHorizontal: -16 },
  chips: { gap: 8, paddingHorizontal: 16 },
  carousel: { gap: 12, paddingHorizontal: 16 },
});
