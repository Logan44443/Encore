import { SHOW_KIND_LABELS, type Entry, type LiveShow } from "@encore/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { companionNames } from "../companions";
import { showPhoto, showTitle } from "../format";
import { colors } from "../theme";
import { Poster } from "./Poster";
import { ScoreBadge } from "./ui";

export function EntryRow({ entry, rank }: { entry: Entry; rank?: number }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/title/${entry.title.mediaType}/${entry.title.tmdbId}`)} style={styles.row}>
      {rank ? <Text style={styles.rank}>{rank}</Text> : null}
      <Poster uri={entry.title.posterUrl} name={entry.title.name} width={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {entry.title.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {entry.genreName}
          {entry.title.year ? ` · ${entry.title.year}` : ""}
          {companionNames(entry.companions) ? ` · with ${companionNames(entry.companions)}` : ""}
        </Text>
      </View>
      <ScoreBadge score={entry.score} />
    </Pressable>
  );
}

/**
 * A live show in the same shape as EntryRow, with the headliner's photo in place
 * of a poster. Pass `owner` (their username) for someone else's show.
 */
export function LiveShowRow({ show, owner }: { show: LiveShow; owner?: string }) {
  const router = useRouter();
  const name = showTitle(show);
  const withWhom = companionNames(show.companions);
  return (
    <Pressable
      onPress={() => router.push(owner ? { pathname: "/show/[id]", params: { id: show.id, user: owner } } : `/show/${show.id}`)}
      style={styles.row}
    >
      <Poster uri={showPhoto(show).uri} name={name} width={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {SHOW_KIND_LABELS[show.kind]}
          {show.venue ? ` · ${show.venue.name}` : ""}
          {` · ${show.date.slice(0, 4)}`}
          {withWhom ? ` · with ${withWhom}` : ""}
        </Text>
      </View>
      {show.rating !== null ? <ScoreBadge score={show.rating} /> : null}
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
  rank: { color: colors.muted, width: 22, textAlign: "center", fontWeight: "800" },
  name: { color: colors.text, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
