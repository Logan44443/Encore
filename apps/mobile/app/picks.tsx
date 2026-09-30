import type { GenreRecommendations, MediaType } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { EntryRow } from "@/components/EntryRow";
import { FeedCard, UndoBar, useDismiss } from "@/components/Feed";
import { PosterRow } from "@/components/Poster";
import { Button, Chip, Empty, ErrorText, H1, Loading, Muted, Screen, SectionTitle } from "@/components/ui";
import { colors } from "@/theme";

type Tab = "trending" | "for-you";

export default function Picks() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; genre?: string; tab?: string }>();
  const type: MediaType = params.type === "tv" ? "tv" : "movie";
  const tab: Tab = params.tab === "for-you" ? "for-you" : "trending";
  const genres = useQuery({
    queryKey: ["genres", type, user?.id],
    queryFn: () => api.catalog.genres(type),
  });
  const genreParam = Number(params.genre);
  const genreId = genres.data?.genres.some((g) => g.id === genreParam) ? genreParam : genres.data?.genres[0]?.id;
  const recs = useQuery({
    queryKey: ["recommendations", type, genreId, user?.id],
    queryFn: () => api.catalog.recommendations(type, genreId!),
    enabled: genreId !== undefined,
  });
  const noun = type === "movie" ? "movies" : "shows";
  const r = recs.data;

  return (
    <Screen>
      <H1>Picks</H1>
      <View style={styles.tabs}>
        <TabButton label="Trending now" active={tab === "trending"} onPress={() => router.setParams({ tab: "trending" })} />
        <TabButton label="Recommended for you" active={tab === "for-you"} onPress={() => router.setParams({ tab: "for-you" })} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Movies" active={type === "movie"} onPress={() => router.setParams({ type: "movie", genre: undefined })} />
        <Chip label="TV" active={type === "tv"} onPress={() => router.setParams({ type: "tv", genre: undefined })} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {genres.data?.genres.map((g) => (
          <Chip
            key={g.id}
            label={g.name}
            count={g.yourCount || undefined}
            active={g.id === genreId}
            onPress={() => router.setParams({ genre: String(g.id) })}
          />
        ))}
      </View>
      <ErrorText error={genres.error ?? recs.error} />
      {recs.isLoading || genres.isLoading ? (
        <Loading />
      ) : r ? (
        tab === "trending" ? (
          <TrendingTab r={r} noun={noun} />
        ) : (
          <ForYouTab r={r} noun={noun} signedIn={!!user} />
        )
      ) : null}
    </Screen>
  );
}

function TrendingTab({ r, noun }: { r: GenreRecommendations; noun: string }) {
  const genre = r.genre.name.toLowerCase();
  return (
    <>
      <SectionTitle children={`Hot in ${genre} this week`} />
      {r.trending.length ? (
        <PosterRow items={r.trending} badgeFor={(item) => ("community" in item && item.community?.recentLogs ? `${item.community.recentLogs} new` : undefined)} />
      ) : (
        <Empty title={`Nothing trending in ${r.genre.name} right now`} />
      )}
      <SectionTitle children={`Encore's favourite ${genre} ${noun}`} />
      {r.community.length ? (
        <PosterRow items={r.community} badgeFor={(item) => ("community" in item && item.community ? item.community.avgScore.toFixed(1) : undefined)} />
      ) : (
        <Empty title={`No community ratings in ${r.genre.name} yet`} />
      )}
    </>
  );
}

function ForYouTab({ r, noun, signedIn }: { r: GenreRecommendations; noun: string; signedIn: boolean }) {
  const router = useRouter();
  const { hidden, dismiss, undo } = useDismiss();
  const genre = r.genre.name.toLowerCase();

  return (
    <>
      {!signedIn ? (
        <>
          <Muted>Sign in and rank a few {noun} to get picks based on your taste.</Muted>
          <Button label="Sign in" onPress={() => router.push("/login")} />
        </>
      ) : r.forYou.length ? (
        <>
          <SectionTitle children="Picked for you" />
          {hidden ? <UndoBar name={hidden.item.title.name} onUndo={undo} /> : null}
          <View style={styles.grid}>
            {r.forYou.map((item) => (
              <FeedCard key={`${item.title.mediaType}-${item.title.tmdbId}`} item={item} width={108} onDismiss={() => dismiss(item)} />
            ))}
          </View>
        </>
      ) : !r.becauseYouLoved ? (
        <Muted>Rank a few {genre} {noun} you liked and personal picks show up here.</Muted>
      ) : null}

      {r.becauseYouLoved && (
        <>
          <SectionTitle children={`Because you loved ${r.becauseYouLoved.title.name}`} />
          <PosterRow items={r.becauseYouLoved.results} />
        </>
      )}

      <SectionTitle children={r.acclaimed.some((t) => t.voteAverage !== null) ? "Critically acclaimed" : `${r.genre.name} essentials`} />
      {r.acclaimed.length ? (
        <PosterRow items={r.acclaimed} badgeFor={(item) => (item.voteAverage !== null ? item.voteAverage.toFixed(1) : undefined)} />
      ) : (
        <Empty title="You've ranked them all" />
      )}

      {r.yourTop.length > 0 && (
        <>
          <SectionTitle children={`Your top ${genre}`} />
          {r.yourTop.map((e, i) => (
            <EntryRow key={e.id} entry={e} rank={i + 1} />
          ))}
        </>
      )}
    </>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  tabActive: { backgroundColor: colors.brand },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: colors.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
