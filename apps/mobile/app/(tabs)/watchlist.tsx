import { WATCHLIST_KIND_LABELS, WATCHLIST_KINDS, type WatchlistItem, type WatchlistKind } from "@encore/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { PerformerSearch } from "@/components/LiveForm";
import { Poster } from "@/components/Poster";
import { AuthGate, Button, Chip, Empty, ErrorText, Field, H1, Loading, Muted, Screen } from "@/components/ui";
import { daysUntil, formatDate } from "@/format";
import { colors } from "@/theme";
import { useWatchlist, useWatchlistMutations } from "@/watchlist";

type Tab = "all" | WatchlistKind;

export default function WatchlistScreen() {
  return (
    <AuthGate>
      <Watchlist />
    </AuthGate>
  );
}

function Watchlist() {
  const [tab, setTab] = useState<Tab>("all");
  const { data, error, isLoading } = useWatchlist();
  const items = data?.items ?? [];
  const counts = Object.fromEntries(WATCHLIST_KINDS.map((k) => [k, items.filter((i) => i.kind === k).length])) as Record<WatchlistKind, number>;
  let visible = tab === "all" ? items : items.filter((i) => i.kind === tab);
  if (tab === "festival") visible = [...visible].sort((a, b) => (a.festival?.date ?? "9999").localeCompare(b.festival?.date ?? "9999"));

  return (
    <Screen>
      <H1>Watchlist</H1>
      <Muted>Movies, shows, artists, and festivals. They come off once you rank or log them.</Muted>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label={`All ${items.length}`} active={tab === "all"} onPress={() => setTab("all")} />
        {WATCHLIST_KINDS.map((k) => (
          <Chip key={k} label={`${WATCHLIST_KIND_LABELS[k]} ${counts[k]}`} active={tab === k} onPress={() => setTab(k)} />
        ))}
      </View>
      <AddPanel tab={tab} />
      <ErrorText error={error} />
      {isLoading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Empty title="Nothing here yet" body="Save something you don't want to forget." />
      ) : (
        visible.map((item) => <WatchRow key={item.id} item={item} />)
      )}
    </Screen>
  );
}

function WatchRow({ item }: { item: WatchlistItem }) {
  const router = useRouter();
  const { remove } = useWatchlistMutations();
  const title = item.title?.name ?? item.performer?.name ?? item.festival?.name ?? "";
  const festival = item.festival;
  const days = festival?.date ? daysUntil(festival.date) : null;
  const open = () => {
    if (item.title) router.push(`/title/${item.kind}/${item.title.tmdbId}`);
    else if (item.performer) {
      router.push({
        pathname: "/show/new",
        params: {
          performer: item.performer.name,
          ...(item.performer.mbid ? { mbid: item.performer.mbid } : {}),
          ...(item.performer.imageUrl ? { image: item.performer.imageUrl } : {}),
        },
      });
    } else if (festival) {
      router.push({
        pathname: "/show/new",
        params: { kind: "festival", name: festival.name, ...(festival.date ? { date: festival.date } : {}) },
      });
    }
  };
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 10 }}>
      {item.title ? <Poster uri={item.title.posterUrl} name={title} width={48} /> : null}
      <Pressable onPress={open} style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "700" }}>{title}</Text>
        <Muted>
          {item.title
            ? `${item.kind === "movie" ? "Movie" : "TV"}${item.title.year ? ` · ${item.title.year}` : ""}`
            : item.performer
              ? "Artist"
              : `Festival${festival?.date ? ` · ${formatDate(festival.date)}` : ""}${days !== null && days >= 0 ? (days === 0 ? " · today" : ` · in ${days} days`) : ""}`}
        </Muted>
        {item.note ? <Muted>{item.note}</Muted> : null}
      </Pressable>
      <Pressable onPress={() => remove.mutate(item.id)}>
        <Text style={{ color: colors.disliked, fontWeight: "700" }}>Remove</Text>
      </Pressable>
    </View>
  );
}

function AddPanel({ tab }: { tab: Tab }) {
  const { add } = useWatchlistMutations();
  const router = useRouter();
  if (tab === "performer") {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: "800" }}>Add an artist you want to see live</Text>
        <PerformerSearch onSelect={(performer) => add.mutate({ kind: "performer", performer })} />
        <ErrorText error={add.error} />
      </View>
    );
  }
  if (tab === "festival") {
    return <AddFestival />;
  }
  if (tab === "all") return null;
  const type = tab === "tv" ? "tv" : "movie";
  return <Button label={tab === "tv" ? "Find shows" : "Find movies"} tone="ghost" onPress={() => router.push(`/discover?type=${type}`)} />;
}

function AddFestival() {
  const { add } = useWatchlistMutations();
  const [f, setF] = useState({ name: "", date: "", city: "", country: "", note: "" });
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontWeight: "800" }}>Add a festival</Text>
      <Field label="Name" value={f.name} onChangeText={(name) => setF({ ...f, name })} placeholder="Glastonbury 2027" />
      <Field label="Date" value={f.date} onChangeText={(date) => setF({ ...f, date })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
      <Field label="City" value={f.city} onChangeText={(city) => setF({ ...f, city })} />
      <Field label="Country" value={f.country} onChangeText={(country) => setF({ ...f, country })} />
      <Field label="Note" value={f.note} onChangeText={(note) => setF({ ...f, note })} />
      <ErrorText error={add.error} />
      <Button
        label="Add festival"
        disabled={!f.name.trim() || add.isPending}
        onPress={() =>
          add.mutate(
            { kind: "festival", name: f.name, date: f.date || null, city: f.city || null, country: f.country || null, note: f.note || null },
            { onSuccess: () => setF({ name: "", date: "", city: "", country: "", note: "" }) },
          )
        }
      />
    </View>
  );
}
