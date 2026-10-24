import type { MediaType } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { EntryRow } from "@/components/EntryRow";
import { EpisodeScoreRow, SeasonScoreRow, ShowScoreRow } from "@/components/TvRows";
import { AuthGate, Button, Chip, Empty, ErrorText, H1, Loading, Muted, Screen, Segmented } from "@/components/ui";

type TvLevel = "shows" | "seasons" | "episodes";

const TV_LEVELS: { value: TvLevel; label: string }[] = [
  { value: "shows", label: "Shows" },
  { value: "seasons", label: "Seasons" },
  { value: "episodes", label: "Episodes" },
];

function GenreChips({ items, genreId, onChange }: { items: { genreId: number; genreName: string }[]; genreId: number | null; onChange: (id: number | null) => void }) {
  const genres = useMemo(() => {
    const counts = new Map<number, { name: string; count: number }>();
    for (const e of items) {
      const g = counts.get(e.genreId) ?? { name: e.genreName, count: 0 };
      g.count++;
      counts.set(e.genreId, g);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [items]);
  if (genres.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Chip label="All" active={genreId === null} onPress={() => onChange(null)} />
      {genres.map(([id, g]) => (
        <Chip key={id} label={g.name} count={g.count} active={genreId === id} onPress={() => onChange(id)} />
      ))}
    </View>
  );
}

/** Movies and books: one ranked list per genre, best first. */
function GenreRankings({ mediaType }: { mediaType: "movie" | "book" }) {
  const router = useRouter();
  const [genreId, setGenreId] = useState<number | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["entries", mediaType],
    queryFn: () => api.entries.list({ mediaType }),
  });
  const all = data?.entries ?? [];
  const entries = all.filter((e) => genreId === null || e.genreId === genreId);
  return (
    <>
      <GenreChips items={all} genreId={genreId} onChange={setGenreId} />
      <ErrorText error={error} />
      {isLoading ? (
        <Loading />
      ) : all.length === 0 ? (
        mediaType === "movie" ? (
          <>
            <Empty title="Nothing ranked yet" body="Rank a movie from its page, or bring over everything you've rated on Letterboxd." />
            <Button label="Import from Letterboxd" tone="ghost" onPress={() => router.push("/import-letterboxd")} />
          </>
        ) : (
          <>
            <Empty title="No books ranked yet" body="Rank a book from its page, or bring over everything you've rated on Goodreads." />
            <Button label="Import from Goodreads" tone="ghost" onPress={() => router.push("/import-goodreads")} />
          </>
        )
      ) : (
        entries.map((e, i) => <EntryRow key={e.id} entry={e} rank={i + 1} />)
      )}
    </>
  );
}

function TvRankings() {
  const [level, setLevel] = useState<TvLevel>("shows");
  const [genreId, setGenreId] = useState<number | null>(null);
  const { data, error, isLoading } = useQuery({ queryKey: ["tv", "all"], queryFn: () => api.tv() });
  const shows = (data?.shows ?? []).filter((s) => genreId === null || s.genreId === genreId);

  return (
    <>
      <Segmented options={TV_LEVELS} value={level} onChange={setLevel} />
      <Muted>
        {level === "shows"
          ? "Shows you've ranked, plus shows scored from your seasons."
          : level === "seasons"
            ? "Every season you've ranked, plus seasons scored from your episodes."
            : "Episodes are ranked against other episodes of the same show. Open a season from a show's page to rank them."}
      </Muted>
      {level === "shows" && <GenreChips items={data?.shows ?? []} genreId={genreId} onChange={setGenreId} />}
      <ErrorText error={error} />
      {isLoading ? (
        <Loading />
      ) : level === "shows" ? (
        shows.length === 0 ? <Empty title="No shows ranked yet" /> : shows.map((s, i) => <ShowScoreRow key={s.title.tmdbId} show={s} rank={i + 1} />)
      ) : level === "seasons" ? (
        (data?.seasons ?? []).length === 0 ? (
          <Empty title="No seasons ranked yet" body="Rank a season from a show's page, or rank some of its episodes." />
        ) : (
          data!.seasons.map((s, i) => <SeasonScoreRow key={`${s.tmdbId}:${s.seasonNumber}`} season={s} rank={i + 1} />)
        )
      ) : (data?.episodes ?? []).length === 0 ? (
        <Empty title="No episodes ranked yet" body="Open a show, pick a season, and tap an episode to rank it." />
      ) : (
        data!.episodes.map((e, i) => <EpisodeScoreRow key={e.id} episode={e} rank={i + 1} />)
      )}
    </>
  );
}

function Rankings() {
  const router = useRouter();
  const [type, setType] = useState<MediaType>("movie");

  return (
    <Screen safeTop>
      <H1>Your rankings</H1>
      <Muted>
        {type !== "tv"
          ? "Scores come from head-to-head comparisons within each genre."
          : "Rank shows, seasons or single episodes. Episodes fill in their season's score, and seasons fill in the show's, unless you've ranked it yourself."}
      </Muted>
      <Button label="Rank something" onPress={() => router.push(`/discover?type=${type}`)} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Movies" active={type === "movie"} onPress={() => setType("movie")} />
        <Chip label="TV" active={type === "tv"} onPress={() => setType("tv")} />
        <Chip label="Books" active={type === "book"} onPress={() => setType("book")} />
      </View>
      {type === "tv" ? <TvRankings /> : <GenreRankings key={type} mediaType={type} />}
    </Screen>
  );
}

export default function ListsScreen() {
  return (
    <AuthGate safeTop>
      <Rankings />
    </AuthGate>
  );
}
