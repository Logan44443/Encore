import type { Entry } from "@encore/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, tierColor } from "../theme";
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
        </Text>
      </View>
      <ScoreBadge score={entry.score} color={tierColor[entry.tier]} />
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
