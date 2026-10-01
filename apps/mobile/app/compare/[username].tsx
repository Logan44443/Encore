import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/api";
import { EntryRow } from "@/components/EntryRow";
import { Poster } from "@/components/Poster";
import { AuthGate, Card, Empty, ErrorText, H1, Loading, Muted, Screen, SectionTitle } from "@/components/ui";
import { colors } from "@/theme";

export default function CompareScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <AuthGate>{username ? <Compare username={username} /> : <Loading />}</AuthGate>;
}

function matchWords(match: number) {
  if (match >= 85) return "You two agree on almost everything.";
  if (match >= 70) return "Pretty similar taste.";
  if (match >= 55) return "Some common ground.";
  return "Opposites. Expect arguments.";
}

function Compare({ username }: { username: string }) {
  const router = useRouter();
  const profile = useQuery({ queryKey: ["profile", username], queryFn: () => api.users.profile(username) });
  const { data, error, isLoading } = useQuery({ queryKey: ["compare", username], queryFn: () => api.users.compare(username) });
  if (isLoading) return <Loading />;
  if (error || !data) {
    return (
      <Screen>
        <ErrorText error={error ?? new Error("Couldn't compare")} />
      </Screen>
    );
  }
  const name = profile.data?.user.displayName ?? `@${username}`;
  return (
    <Screen>
      <Card style={{ alignItems: "center", gap: 4 }}>
        <Muted>Taste match with {name}</Muted>
        {data.match !== null ? (
          <>
            <H1>{data.match}%</H1>
            <Muted>{matchWords(data.match)}</Muted>
          </>
        ) : (
          <Muted>Rank at least 3 of the same titles to see how your tastes line up.</Muted>
        )}
        <Muted>
          {data.both.length} {data.both.length === 1 ? "title" : "titles"} you both ranked
        </Muted>
      </Card>

      {data.both.length ? (
        <>
          <SectionTitle>You both ranked</SectionTitle>
          <View style={styles.headRow}>
            <Text style={[styles.head, { flex: 1 }]}>Biggest disagreements first</Text>
            <Text style={styles.head}>You</Text>
            <Text style={styles.head}>{name.length > 8 ? "Them" : name}</Text>
          </View>
          {data.both.map((b) => (
            <Pressable key={`${b.title.mediaType}:${b.title.tmdbId}`} style={styles.row} onPress={() => router.push(`/title/${b.title.mediaType}/${b.title.tmdbId}`)}>
              <Poster uri={b.title.posterUrl} name={b.title.name} width={36} />
              <Text style={styles.name} numberOfLines={1}>
                {b.title.name}
              </Text>
              <Text style={styles.score}>{b.mine.toFixed(1)}</Text>
              <Text style={[styles.score, { color: colors.brand }]}>{b.theirs.toFixed(1)}</Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <SectionTitle>{`${name} loved, you haven't ranked`}</SectionTitle>
      {data.theyLoved.length ? data.theyLoved.map((e) => <EntryRow key={e.id} entry={e} />) : <Empty title="Nothing yet" />}

      <SectionTitle>{`You loved, ${name} hasn't ranked`}</SectionTitle>
      {data.youLoved.length ? data.youLoved.map((e) => <EntryRow key={e.id} entry={e} />) : <Empty title="Nothing yet" />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", gap: 10, paddingHorizontal: 8 },
  head: { color: colors.muted, fontSize: 11, fontWeight: "700", width: 44, textAlign: "center" },
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
  name: { flex: 1, color: colors.text, fontWeight: "700" },
  score: { width: 44, textAlign: "center", color: colors.text, fontWeight: "800" },
});
