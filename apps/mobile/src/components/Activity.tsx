import type { ActivityItem } from "@encore/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { companionNames } from "../companions";
import { showTitle } from "../format";
import { colors, tierColor } from "../theme";
import { Poster } from "./Poster";
import { Avatar, ScoreBadge } from "./ui";

/** How long ago, in the short form people expect in a feed ("5m", "3h", "2d"). */
export function ago(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / (60 * 24))}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Sam ranked Dune · 2h", with the poster and their score. Tapping opens the title, or their profile for a show. */
export function ActivityRow({ item }: { item: ActivityItem }) {
  const router = useRouter();
  const isEntry = item.kind === "entry";
  const name = isEntry ? item.entry.title.name : showTitle(item.show);
  const withWhom = companionNames(isEntry ? item.entry.companions : item.show.companions);
  const review = isEntry ? item.entry.review : item.show.liked;
  const headliner = !isEntry ? (item.show.lineup.find((s) => s.role === "headliner") ?? item.show.lineup[0]) : null;
  const open = () =>
    isEntry ? router.push(`/title/${item.entry.title.mediaType}/${item.entry.title.tmdbId}`) : router.push(`/user/${item.user.username}`);

  return (
    <Pressable onPress={open} style={styles.row}>
      <Poster uri={isEntry ? item.entry.title.posterUrl : (headliner?.performer.imageUrl ?? null)} name={name} width={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Avatar name={item.user.displayName} size={18} />
          <Text style={styles.meta} numberOfLines={1}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{item.user.displayName}</Text>
            {isEntry ? " ranked" : " saw"} · {ago(item.at)}
          </Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {withWhom ? (
          <Text style={styles.meta} numberOfLines={1}>
            with {withWhom}
          </Text>
        ) : null}
        {review ? (
          <Text style={styles.review} numberOfLines={2}>
            “{review}”
          </Text>
        ) : null}
      </View>
      {isEntry ? (
        <ScoreBadge score={item.entry.score} color={tierColor[item.entry.tier]} />
      ) : item.show.rating !== null ? (
        <ScoreBadge score={item.show.rating} color={colors.brand} />
      ) : null}
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
  name: { color: colors.text, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  review: { color: colors.zinc, fontSize: 13, fontStyle: "italic" },
});
