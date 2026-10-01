import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { ActivityRow } from "@/components/Activity";
import { EntryRow, LiveShowRow } from "@/components/EntryRow";
import { FeedCard, UndoBar, useDismiss, useFeed } from "@/components/Feed";
import { Button, Card, Empty, ErrorText, H1, Loading, Muted, Screen, SectionTitle } from "@/components/ui";
import { useFriends } from "@/friends";
import { colors } from "@/theme";

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
  // Titles and live shows together, newest first.
  const recent = [
    ...(entries.data?.entries ?? []).map((entry) => ({ kind: "entry" as const, entry, at: entry.createdAt })),
    ...(live.data?.shows ?? []).map((show) => ({ kind: "show" as const, show, at: show.createdAt })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);

  return (
    <Screen>
      <H1>Hey, {name}</H1>
      <View style={styles.actions}>
        <Action icon="film-outline" label="Movie" onPress={() => router.push("/discover?type=movie")} />
        <Action icon="tv-outline" label="Series" onPress={() => router.push("/discover?type=tv")} />
        <Action icon="ticket-outline" label="Live show" onPress={() => router.push("/show/new")} />
      </View>

      <SectionTitle children="Recently ranked" action={<LinkText label="See all" onPress={() => router.push("/lists")} />} />
      {entries.isLoading || live.isLoading ? (
        <Loading />
      ) : recent.length ? (
        recent.map((r) => (r.kind === "entry" ? <EntryRow key={r.entry.id} entry={r.entry} /> : <LiveShowRow key={r.show.id} show={r.show} />))
      ) : (
        <Empty title="No rankings yet" body="Rank a movie or series, or add a show you went to." />
      )}

      <FriendsActivity />

      <Recommended />
    </Screen>
  );
}

/** The latest from friends, or a nudge to add some. */
function FriendsActivity() {
  const router = useRouter();
  const friends = useFriends();
  const activity = useQuery({ queryKey: ["activity", "home"], queryFn: () => api.friends.activity() });
  if (friends.isLoading || activity.isLoading) return null;
  if (!friends.data?.friends.length) {
    return (
      <>
        <SectionTitle children="Friends" />
        <Card>
          <Muted>See what your friends are ranking, compare tastes, and log what you watched together.</Muted>
          <Button label="Find friends" tone="ghost" onPress={() => router.push("/friends/add")} />
        </Card>
      </>
    );
  }
  const items = activity.data?.items.slice(0, 4) ?? [];
  return (
    <>
      <SectionTitle children="From friends" action={items.length ? <LinkText label="See all" onPress={() => router.push("/activity")} /> : undefined} />
      {activity.error ? (
        <ErrorText error={activity.error} />
      ) : items.length ? (
        items.map((item) => <ActivityRow key={item.kind === "entry" ? `e:${item.entry.id}` : `s:${item.show.id}`} item={item} />)
      ) : (
        <Empty title="Nothing from friends yet" body="When friends rank something or log a show, it shows up here." />
      )}
    </>
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

function Action({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.action} accessibilityLabel={`Add a ${label.toLowerCase()}`}>
      <Ionicons name="add" color={colors.brand} size={14} style={styles.plus} />
      <Ionicons name={icon} color={colors.text} size={22} />
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

const styles = StyleSheet.create({
  feature: { color: colors.text, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, alignItems: "center", gap: 6, backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingVertical: 14 },
  plus: { position: "absolute", top: 8, right: 10 },
  actionLabel: { color: colors.text, fontWeight: "700", fontSize: 13 },
});
