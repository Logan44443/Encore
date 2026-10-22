import { tierForScore, type EpisodeEntry } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/api";
import { EpisodeSheet, queueFrom } from "@/components/EpisodeRank";
import { SeasonSheet } from "@/components/SeasonRank";
import { sourceNote } from "@/components/TvRows";
import { AuthGate, Button, ErrorText, H1, Loading, Muted, ScoreBadge, Screen, SectionTitle, showMenu } from "@/components/ui";
import { formatDate } from "@/format";
import { colors, tierColor } from "@/theme";
import { invalidateTv, seasonName } from "@/tv";

function Season() {
  const { id, season } = useLocalSearchParams<{ id: string; season: string }>();
  const tmdbId = Number(id);
  const seasonNumber = Number(season);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [seasonSheet, setSeasonSheet] = useState<null | "one" | "rerank">(null);
  const [queue, setQueue] = useState<ReturnType<typeof queueFrom> | null>(null);
  const [selected, setSelected] = useState<number[] | null>(null);

  const title = useQuery({ queryKey: ["title", "tv", tmdbId], queryFn: () => api.catalog.title("tv", tmdbId) });
  const episodes = useQuery({
    queryKey: ["catalog-season", tmdbId, seasonNumber],
    queryFn: () => api.catalog.season(tmdbId, seasonNumber),
  });
  const tv = useQuery({ queryKey: ["tv", tmdbId], queryFn: () => api.tv(tmdbId) });

  const removeEpisode = useMutation({
    mutationFn: (entryId: string) => api.episodes.remove(entryId),
    onSuccess: () => invalidateTv(queryClient, tmdbId),
  });
  const removeSeason = useMutation({
    mutationFn: (entryId: string) => api.seasons.remove(entryId),
    onSuccess: () => invalidateTv(queryClient, tmdbId),
  });

  if (title.isLoading || episodes.isLoading || tv.isLoading) return <Loading />;
  if (!title.data || !episodes.data) {
    return (
      <Screen>
        <ErrorText error={title.error ?? episodes.error ?? new Error("Not found")} />
      </Screen>
    );
  }

  const show = title.data.title;
  const meta = show.seasons.find((s) => s.seasonNumber === seasonNumber);
  const label = seasonName(seasonNumber, meta?.name ?? "");
  const score = tv.data?.seasons.find((s) => s.seasonNumber === seasonNumber) ?? null;
  const ranked = (tv.data?.episodes ?? []).filter((e) => e.seasonNumber === seasonNumber);
  const rankedBy = new Map(ranked.map((e) => [e.episodeNumber, e]));
  const all = queueFrom(episodes.data.episodes, ranked);
  const unranked = all.filter((q) => !q.existing);

  const openRanked = (entry: EpisodeEntry) =>
    showMenu(entry.name, [
      { label: "Re-rank", onPress: () => setQueue(all.filter((q) => q.existing?.id === entry.id)) },
      {
        label: "Remove ranking",
        destructive: true,
        onPress: () => removeEpisode.mutate(entry.id),
      },
    ]);

  return (
    <Screen>
      <Pressable onPress={() => router.push(`/title/tv/${tmdbId}`)}>
        <Text style={styles.kicker}>{show.name}</Text>
      </Pressable>
      <H1>{label}</H1>
      <Muted>{episodes.data.episodes.length} episodes</Muted>

      <View style={styles.card}>
        {score ? (
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <ScoreBadge score={score.score} color={tierColor[score.entry && score.source === "ranked" ? score.entry.tier : tierForScore(score.score)]} size={64} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.cardTitle}>
                {score.source === "ranked" ? "Your ranking of this season" : sourceNote(score.rankedEpisodes, "episode")}
              </Text>
              {score.source === "ranked" && score.episodeAverage !== null ? (
                <Muted>Your episodes average {score.episodeAverage.toFixed(1)}</Muted>
              ) : null}
              {score.source === "episodes" ? <Muted>Rank the season itself to set your own score.</Muted> : null}
            </View>
          </View>
        ) : (
          <Muted>Not ranked yet. Rank the whole season, or rank its episodes and the season's score fills in from them.</Muted>
        )}
        {score?.entry ? (
          <View style={{ gap: 8 }}>
            <Button label="Re-rank this season" tone="ghost" onPress={() => setSeasonSheet("rerank")} />
            <Button
              label="Remove season ranking"
              tone="ghost"
              onPress={() =>
                Alert.alert(`Remove your ${label} ranking?`, "Its score will come from its episodes, if you've ranked any.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => removeSeason.mutate(score.entry!.id) },
                ])
              }
            />
          </View>
        ) : (
          <Button label="Rank this season" tone="ghost" onPress={() => setSeasonSheet("one")} />
        )}
        <ErrorText error={removeSeason.error} />
      </View>

      <SectionTitle
        action={
          unranked.length > 0 && !selected ? (
            <Pressable onPress={() => setSelected(unranked.map((q) => q.episodeNumber))}>
              <Text style={styles.link}>Rank several</Text>
            </Pressable>
          ) : undefined
        }
      >
        Episodes
      </SectionTitle>
      <Muted>Each episode is compared with the other episodes of this show you've ranked, from any season.</Muted>
      {selected && (
        <View style={{ gap: 8 }}>
          <Muted>Tap to untick the ones you haven't watched.</Muted>
          <Button
            label={`Rank ${selected.length} episode${selected.length === 1 ? "" : "s"}`}
            disabled={selected.length === 0}
            onPress={() => {
              setQueue(unranked.filter((q) => selected.includes(q.episodeNumber)));
              setSelected(null);
            }}
          />
          <Button label="Cancel" tone="ghost" onPress={() => setSelected(null)} />
        </View>
      )}
      {all.map((q) => {
        const entry = rankedBy.get(q.episodeNumber);
        const ticked = selected?.includes(q.episodeNumber) ?? false;
        const episode = episodes.data.episodes.find((e) => e.episode === q.episodeNumber);
        return (
          <Pressable
            key={q.episodeNumber}
            style={[styles.row, ticked && styles.rowTicked]}
            onPress={() => {
              if (entry) openRanked(entry);
              else if (selected) {
                setSelected(ticked ? selected.filter((n) => n !== q.episodeNumber) : [...selected, q.episodeNumber]);
              } else setQueue([q]);
            }}
          >
            <Text style={styles.number}>{q.episodeNumber}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>
                {q.name}
              </Text>
              {episode?.airDate ? <Text style={styles.meta}>{formatDate(episode.airDate)}</Text> : null}
            </View>
            {entry ? (
              <ScoreBadge score={entry.score} color={tierColor[entry.tier]} />
            ) : selected ? (
              <Text style={[styles.tick, ticked && { color: colors.brand }]}>{ticked ? "✓" : "○"}</Text>
            ) : (
              <Text style={styles.link}>Rank</Text>
            )}
          </Pressable>
        );
      })}
      <ErrorText error={removeEpisode.error} />

      {seasonSheet && (
        <SeasonSheet
          title={show}
          mode={seasonSheet}
          existing={seasonSheet === "rerank" ? score?.entry : null}
          only={seasonNumber}
          onClose={() => setSeasonSheet(null)}
        />
      )}
      {queue && queue.length > 0 && <EpisodeSheet tmdbId={tmdbId} showName={show.name} queue={queue} onClose={() => setQueue(null)} />}
    </Screen>
  );
}

export default function SeasonScreen() {
  return (
    <AuthGate>
      <Season />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  kicker: { color: colors.brand, fontSize: 13, fontWeight: "700" },
  card: { gap: 10, backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14 },
  cardTitle: { color: colors.text, fontWeight: "700" },
  link: { color: colors.brand, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    minHeight: 56,
  },
  rowTicked: { borderColor: "rgba(245,158,11,0.45)" },
  number: { color: colors.muted, width: 24, textAlign: "center", fontWeight: "800" },
  name: { color: colors.text, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  tick: { color: colors.muted, fontSize: 18, fontWeight: "800", width: 44, textAlign: "center" },
});
