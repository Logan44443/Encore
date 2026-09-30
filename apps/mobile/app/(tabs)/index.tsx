import type { WatchlistItem } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { EntryRow } from "@/components/EntryRow";
import { FeedCard, UndoBar, useDismiss, useFeed } from "@/components/Feed";
import { Poster } from "@/components/Poster";
import { Button, Card, Empty, ErrorText, H1, Loading, Muted, Screen, SectionTitle } from "@/components/ui";
import { showTitle } from "@/format";
import { colors } from "@/theme";
import { useWatchlist } from "@/watchlist";

export default function Home() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return user ? <Dashboard name={user.displayName} /> : <Landing />;
}

function Landing() {
  const router = useRouter();
  const features = [
    ["Rank movies by genre", "Compare a film with your other thrillers, comedies, or dramas. The list orders itself."],
    ["Track every series", "Score shows the same way, then rank their seasons against each other."],
    ["Relive every show", "Concerts, festivals, DJ sets, theatre. Lineup, venue, setlist, and what hit."],
    ["A watchlist for all of it", "Movies, shows, artists you want to see, and festivals. They drop off once you log them."],
  ];
  return (
    <Screen>
      <H1>Everything you watch. Every show you're at.</H1>
      <Muted>Head-to-head choices become honest scores for movies, TV, and the seasons of a show.</Muted>
      <Button label="Get started" onPress={() => router.push("/register")} />
      <Button label="Browse titles" tone="ghost" onPress={() => router.push("/discover")} />
      {features.map(([title, body]) => (
        <Card key={title}>
          <Text style={styles.feature}>{title}</Text>
          <Muted>{body}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

function Dashboard({ name }: { name: string }) {
  const router = useRouter();
  const entries = useQuery({ queryKey: ["entries", "all"], queryFn: () => api.entries.list() });
  const live = useQuery({ queryKey: ["live"], queryFn: () => api.live.list() });
  const watchlist = useWatchlist();
  const recent = [...(entries.data?.entries ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const upcoming = watchlist.data?.items.slice(0, 4) ?? [];

  return (
    <Screen>
      <H1>Hey, {name}</H1>
      <View style={styles.actions}>
        <Action label="Rank a movie" onPress={() => router.push("/discover?type=movie")} />
        <Action label="Rank a series" onPress={() => router.push("/discover?type=tv")} />
        <Action label="Add a live show" onPress={() => router.push("/show/new")} />
        <Action label="Watchlist" onPress={() => router.push("/watchlist")} />
      </View>

      <SectionTitle children="Up next" action={<LinkText label="Watchlist" onPress={() => router.push("/watchlist")} />} />
      {watchlist.isLoading ? (
        <Loading />
      ) : upcoming.length ? (
        <View style={styles.actions}>
          {upcoming.map((item) => (
            <WatchChip key={item.id} item={item} />
          ))}
        </View>
      ) : (
        <Empty title="Nothing saved yet" body="Bookmark a movie, show, artist, or festival." />
      )}

      <SectionTitle children="Recently ranked" action={<LinkText label="All rankings" onPress={() => router.push("/lists")} />} />
      {entries.isLoading ? <Loading /> : recent.length ? recent.map((e) => <EntryRow key={e.id} entry={e} />) : <Empty title="No rankings yet" body="Pick something from Discover." />}

      <SectionTitle children="Recent live shows" action={<LinkText label="All shows" onPress={() => router.push("/live")} />} />
      {live.isLoading ? (
        <Loading />
      ) : live.data?.shows.length ? (
        live.data.shows.slice(0, 4).map((s) => (
          <Pressable key={s.id} onPress={() => router.push(`/show/${s.id}`)} style={styles.live}>
            <Text style={styles.feature}>{showTitle(s)}</Text>
            <Muted>{s.date}</Muted>
          </Pressable>
        ))
      ) : (
        <Empty title="No live shows yet" body="Add the last show you went to." />
      )}

      <Recommended />
    </Screen>
  );
}

function Recommended() {
  const router = useRouter();
  const feed = useFeed();
  const { hidden, dismiss, undo } = useDismiss();
  const items = feed.data?.items.slice(0, 12) ?? [];

  return (
    <>
      <SectionTitle children="Recommended for you" action={<LinkText label="See all" onPress={() => router.push("/recommended")} />} />
      {feed.data && !feed.data.personalized ? <Muted>Rank a few titles you liked and this fills with picks just for you.</Muted> : null}
      {hidden ? <UndoBar name={hidden.item.title.name} onUndo={undo} /> : null}
      {feed.isLoading ? (
        <Loading />
      ) : feed.error ? (
        <ErrorText error={feed.error} />
      ) : items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
          {items.map((item) => (
            <FeedCard key={`${item.title.mediaType}-${item.title.tmdbId}`} item={item} onDismiss={() => dismiss(item)} />
          ))}
        </ScrollView>
      ) : (
        <Empty title="You're all caught up" body="Rank more titles for fresh picks." />
      )}
    </>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Text style={{ color: colors.brand, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function WatchChip({ item }: { item: WatchlistItem }) {
  const router = useRouter();
  const name = item.title?.name ?? item.performer?.name ?? item.festival?.name ?? "Saved";
  const go = () => {
    if (item.title) router.push(`/title/${item.kind}/${item.title.tmdbId}`);
    else router.push("/watchlist");
  };
  return (
    <Pressable onPress={go} style={{ width: 100 }}>
      {item.title ? <Poster uri={item.title.posterUrl} name={name} width={100} /> : <View style={styles.placeholder}><Text style={styles.actionLabel}>{name.slice(0, 1)}</Text></View>}
      <Text style={styles.chipName} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  feature: { color: colors.text, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { width: "47%", backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16 },
  actionLabel: { color: colors.text, fontWeight: "700", textAlign: "center" },
  live: { backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4 },
  placeholder: { width: 100, height: 150, borderRadius: 12, backgroundColor: colors.panel2, alignItems: "center", justifyContent: "center" },
  chipName: { color: colors.text, fontSize: 12, marginTop: 4, fontWeight: "600" },
});
