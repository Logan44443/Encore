import { type EpisodeEntry, type SeasonScore, type ShowScore } from "@encore/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { episodeCode, seasonName } from "../tv";
import { Poster } from "./Poster";
import { ScoreBadge } from "./ui";

/** Where a rolled-up score came from, e.g. "From 3 seasons". */
export function sourceNote(count: number, noun: "episode" | "season") {
  return `From ${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function ShowScoreRow({ show, rank }: { show: ShowScore; rank?: number }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/title/tv/${show.title.tmdbId}`)} style={styles.row}>
      {rank ? (
        <Text style={styles.rank} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {rank}
        </Text>
      ) : null}
      <Poster uri={show.title.posterUrl} name={show.title.name} width={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {show.title.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {show.genreName}
          {show.title.year ? ` · ${show.title.year}` : ""}
          {show.source === "seasons" ? ` · ${sourceNote(show.rankedSeasons, "season")}` : ""}
        </Text>
      </View>
      <ScoreBadge score={show.score} />
    </Pressable>
  );
}

export function SeasonScoreRow({ season, rank, showName = true }: { season: SeasonScore; rank?: number; showName?: boolean }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/season/${season.tmdbId}/${season.seasonNumber}`)} style={styles.row}>
      {rank ? (
        <Text style={styles.rank} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {rank}
        </Text>
      ) : null}
      {showName ? <Poster uri={season.posterUrl} name={season.showName} width={44} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {showName ? `${season.showName} · ` : ""}
          {seasonName(season.seasonNumber, season.name)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {season.source === "episodes"
            ? sourceNote(season.rankedEpisodes, "episode")
            : season.rankedEpisodes > 0 && season.episodeAverage !== null
              ? `Ranked · episodes average ${season.episodeAverage.toFixed(1)}`
              : "Ranked"}
        </Text>
      </View>
      <ScoreBadge score={season.score} />
    </Pressable>
  );
}

export function EpisodeScoreRow({ episode, rank, onPress }: { episode: EpisodeEntry; rank?: number; onPress?: () => void }) {
  const router = useRouter();
  return (
    <Pressable onPress={onPress ?? (() => router.push(`/season/${episode.tmdbId}/${episode.seasonNumber}`))} style={styles.row}>
      {rank ? (
        <Text style={styles.rank} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {rank}
        </Text>
      ) : null}
      <Poster uri={episode.posterUrl} name={episode.showName} width={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {episode.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {episode.showName} · {episodeCode(episode.seasonNumber, episode.episodeNumber)}
        </Text>
      </View>
      <ScoreBadge score={episode.score} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
  },
  // Wide enough for three digits on one line; four or more shrink to fit instead of wrapping.
  rank: { color: colors.muted, width: 30, textAlign: "center", fontWeight: "800", fontVariant: ["tabular-nums"] },
  name: { color: colors.text, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
