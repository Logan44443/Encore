import type { FriendRanking, MediaType } from "@encore/shared";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { colors, tierColor } from "../theme";
import { Avatar, Muted, ScoreBadge, SectionTitle, showMenu } from "./ui";

/** "Friends": who ranked this title, their scores and reviews, and who wants to watch it. */
export function FriendsOnTitle({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const { data } = useQuery({
    queryKey: ["friends-on-title", mediaType, tmdbId],
    queryFn: () => api.friends.onTitle(mediaType, tmdbId),
  });
  if (!data || (!data.rankings.length && !data.wantToWatch.length)) return null;
  const want = data.wantToWatch.map((u) => u.displayName);
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle
        children="Friends"
        action={data.average !== null ? <Text style={{ color: colors.brand, fontWeight: "800" }}>avg {data.average.toFixed(1)}</Text> : undefined}
      />
      {data.rankings.map((r) => (
        <FriendRankingRow key={r.entryId} ranking={r} />
      ))}
      {want.length ? (
        <Muted>
          {want.length === 1 ? `${want[0]} wants` : `${want.slice(0, -1).join(", ")} and ${want.at(-1)} want`} to watch this.
        </Muted>
      ) : null}
    </View>
  );
}

function FriendRankingRow({ ranking: r }: { ranking: FriendRanking }) {
  const router = useRouter();
  const report = () =>
    router.push({
      pathname: "/report",
      params: { userId: r.user.id, username: r.user.username, kind: "review", targetId: r.entryId },
    });
  return (
    <Pressable onPress={() => router.push(`/user/${r.user.username}`)} style={styles.row}>
      <Avatar name={r.user.displayName} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name}>{r.user.displayName}</Text>
        <Text style={styles.meta}>
          {r.genreName}
          {r.watchedAt ? ` · watched ${r.watchedAt}` : ""}
        </Text>
        {r.review ? <Text style={styles.review}>“{r.review}”</Text> : null}
      </View>
      <ScoreBadge score={r.score} color={tierColor[r.tier]} />
      {r.review ? (
        <Pressable hitSlop={10} accessibilityLabel="More" onPress={() => showMenu(undefined, [{ label: "Report review", destructive: true, onPress: report }])}>
          <Ionicons name="ellipsis-vertical" color={colors.muted} size={16} />
        </Pressable>
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
    padding: 10,
  },
  name: { color: colors.text, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12 },
  review: { color: colors.zinc, fontSize: 13, lineHeight: 18 },
});
