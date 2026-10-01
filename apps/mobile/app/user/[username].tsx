import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { api } from "@/api";
import { EntryRow } from "@/components/EntryRow";
import { Card, Empty, ErrorText, H1, Loading, Muted, Screen } from "@/components/ui";
import { showTitle } from "@/format";
import { colors } from "@/theme";

export function ProfileBody({ username }: { username: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => api.users.profile(username),
  });
  if (isLoading) return <Loading />;
  if (error || !data) {
    return (
      <Screen>
        <ErrorText error={error ?? new Error("Profile not found")} />
      </Screen>
    );
  }
  const { user, stats, topMovies, topShows, recentLiveShows } = data;
  const statItems = [
    ["Movies", stats.movies],
    ["Series", stats.series],
    ["Live", stats.liveShows],
    ["Acts", stats.performers],
    ["Cities", stats.cities],
  ] as const;

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand2, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "white", fontSize: 28, fontWeight: "900" }}>{user.displayName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View>
          <H1>{user.displayName}</H1>
          <Muted>@{user.username}</Muted>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {statItems.map(([label, value]) => (
          <Card key={label} style={{ flex: 1, alignItems: "center", padding: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>{value}</Text>
            <Text style={{ color: colors.muted, fontSize: 10 }}>{label}</Text>
          </Card>
        ))}
      </View>
      <Text style={{ color: colors.text, fontWeight: "800" }}>Top movies</Text>
      {topMovies.length ? topMovies.map((e, i) => <EntryRow key={e.id} entry={e} rank={i + 1} />) : <Empty title="No movies ranked yet" />}
      <Text style={{ color: colors.text, fontWeight: "800" }}>Top series</Text>
      {topShows.length ? topShows.map((e, i) => <EntryRow key={e.id} entry={e} rank={i + 1} />) : <Empty title="No series ranked yet" />}
      <Text style={{ color: colors.text, fontWeight: "800" }}>Recent live shows</Text>
      {recentLiveShows.length ? (
        recentLiveShows.map((s) => (
          <Card key={s.id}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{showTitle(s)}</Text>
            <Muted>{s.date}</Muted>
          </Card>
        ))
      ) : (
        <Empty title="No live shows yet" />
      )}
    </Screen>
  );
}

export default function UserProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  if (!username) return <Loading />;
  return <ProfileBody username={username} />;
}
