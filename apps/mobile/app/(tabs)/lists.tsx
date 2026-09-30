import type { MediaType } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { EntryRow } from "@/components/EntryRow";
import { AuthGate, Button, Chip, Empty, ErrorText, H1, Loading, Muted, Screen } from "@/components/ui";

function Rankings() {
  const router = useRouter();
  const [type, setType] = useState<MediaType>("movie");
  const [genreId, setGenreId] = useState<number | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["entries", type],
    queryFn: () => api.entries.list({ mediaType: type }),
  });
  const genres = useMemo(() => {
    const counts = new Map<number, { name: string; count: number }>();
    for (const e of data?.entries ?? []) {
      const g = counts.get(e.genreId) ?? { name: e.genreName, count: 0 };
      g.count++;
      counts.set(e.genreId, g);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [data]);
  const entries = (data?.entries ?? []).filter((e) => genreId === null || e.genreId === genreId);

  return (
    <Screen>
      <H1>Your rankings</H1>
      <Muted>Scores come from head-to-head comparisons within each genre. Seasons of a show are ranked on the show itself.</Muted>
      <Button label="Rank something" onPress={() => router.push(`/discover?type=${type}`)} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Movies" active={type === "movie"} onPress={() => { setType("movie"); setGenreId(null); }} />
        <Chip label="TV" active={type === "tv"} onPress={() => { setType("tv"); setGenreId(null); }} />
      </View>
      {genres.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="All" active={genreId === null} onPress={() => setGenreId(null)} />
          {genres.map(([id, g]) => (
            <Chip key={id} label={g.name} count={g.count} active={genreId === id} onPress={() => setGenreId(id)} />
          ))}
        </View>
      )}
      <ErrorText error={error} />
      {isLoading ? <Loading /> : entries.length === 0 ? <Empty title="Nothing ranked yet" /> : entries.map((e, i) => <EntryRow key={e.id} entry={e} rank={i + 1} />)}
    </Screen>
  );
}

export default function ListsScreen() {
  return (
    <AuthGate>
      <Rankings />
    </AuthGate>
  );
}
