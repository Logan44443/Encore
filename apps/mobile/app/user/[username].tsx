import type { LiveShow, Profile } from "@encore/shared";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { api } from "@/api";
import { EntryRow } from "@/components/EntryRow";
import { AuthGate, Avatar, Button, Card, Empty, ErrorText, H1, Loading, Muted, Screen, SettingsGroup, SettingsRow, showMenu } from "@/components/ui";
import { companionNames } from "@/companions";
import { errorMessage, formatDate, showTitle } from "@/format";
import { useFriendRequests, useFriends, useRefreshFriends } from "@/friends";
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
  const { user, stats, topMovies, topShows, recentLiveShows, relationship, canView } = data;
  const statItems = [
    ["Movies", stats.movies],
    ["Series", stats.series],
    ["Live", stats.liveShows],
    ["Acts", stats.performers],
    ["Cities", stats.cities],
  ] as const;

  return (
    <Screen>
      {relationship !== "self" && <Stack.Screen options={{ headerRight: () => <ProfileMenu profile={data} /> }} />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar name={user.displayName} size={64} />
        <View style={{ flex: 1 }}>
          <H1>{user.displayName}</H1>
          <Muted>@{user.username}</Muted>
        </View>
      </View>
      {relationship === "self" ? <FriendsLink /> : <RelationshipActions profile={data} />}
      {!canView ? (
        <Empty title="This profile is private" body={`Only people ${user.displayName} has added as friends can see their rankings and shows.`} />
      ) : (
        <>
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
          {recentLiveShows.length ? recentLiveShows.map((s) => <ShowCard key={s.id} show={s} />) : <Empty title="No live shows yet" />}
        </>
      )}
      {relationship === "friend" && <Together username={user.username} />}
    </Screen>
  );
}

function ShowCard({ show }: { show: LiveShow }) {
  const withWhom = companionNames(show.companions);
  return (
    <Card>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{showTitle(show)}</Text>
      <Muted>
        {formatDate(show.date)}
        {withWhom ? ` · with ${withWhom}` : ""}
      </Muted>
    </Card>
  );
}

/** Everything you and a friend watched together, from either of your logs. */
function Together({ username }: { username: string }) {
  const { data } = useQuery({ queryKey: ["together", username], queryFn: () => api.users.together(username) });
  if (!data || (!data.entries.length && !data.shows.length)) return null;
  return (
    <>
      <Text style={{ color: colors.text, fontWeight: "800" }}>Watched together</Text>
      {data.entries.map((e) => (
        <EntryRow key={e.id} entry={e} />
      ))}
      {data.shows.map((s) => (
        <ShowCard key={s.id} show={s} />
      ))}
    </>
  );
}

/** Your own profile: a way into Friends, with the number of requests waiting. */
function FriendsLink() {
  const router = useRouter();
  const friends = useFriends();
  const requests = useFriendRequests();
  const waiting = requests.data?.incoming.length ?? 0;
  const count = friends.data?.friends.length;
  return (
    <SettingsGroup>
      <SettingsRow
        label={waiting ? `Friends · ${waiting} ${waiting === 1 ? "request" : "requests"}` : "Friends"}
        value={count === undefined ? undefined : String(count)}
        onPress={() => router.push("/friends")}
        last
      />
    </SettingsGroup>
  );
}

/** Add friend / Requested / Accept / Friends, depending on where you stand with them. */
function RelationshipActions({ profile }: { profile: Profile }) {
  const refresh = useRefreshFriends();
  const [pending, setPending] = useState(false);
  const { user, relationship, requestId, canRequest } = profile;

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setPending(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      Alert.alert(failure, errorMessage(err) ?? "Try again.");
    } finally {
      setPending(false);
    }
  };

  if (relationship === "friend") {
    return (
      <Button
        label="Friends ✓"
        tone="ghost"
        disabled={pending}
        onPress={() =>
          showMenu(undefined, [
            {
              label: `Remove ${user.displayName} as a friend`,
              destructive: true,
              onPress: () => run(() => api.friends.remove(user.id), "Couldn't remove friend"),
            },
          ])
        }
      />
    );
  }
  if (relationship === "incoming" && requestId) {
    return (
      <View style={{ gap: 8 }}>
        <Muted>{user.displayName} wants to be friends.</Muted>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Accept" disabled={pending} onPress={() => run(() => api.friends.accept(requestId), "Couldn't accept")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Decline"
              tone="ghost"
              disabled={pending}
              onPress={() => run(() => api.friends.dismissRequest(requestId), "Couldn't decline")}
            />
          </View>
        </View>
      </View>
    );
  }
  if (relationship === "requested" && requestId) {
    return (
      <Button
        label="Requested"
        tone="ghost"
        disabled={pending}
        onPress={() =>
          showMenu(undefined, [
            { label: "Cancel request", destructive: true, onPress: () => run(() => api.friends.dismissRequest(requestId), "Couldn't cancel") },
          ])
        }
      />
    );
  }
  if (!canRequest) return <Muted>{user.displayName} isn't taking friend requests.</Muted>;
  return (
    <Button
      label={pending ? "…" : "Add friend"}
      disabled={pending}
      onPress={() => run(() => api.friends.request({ username: user.username }), "Couldn't send request")}
    />
  );
}

/** The ••• menu on someone else's profile: report and block. */
function ProfileMenu({ profile }: { profile: Profile }) {
  const router = useRouter();
  const refresh = useRefreshFriends();
  const { user } = profile;

  const block = () =>
    Alert.alert(
      `Block ${user.displayName}?`,
      "They won't be able to find you, see your profile or send you requests, and you'll stop being friends. They aren't told.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await api.safety.block({ userId: user.id });
              await refresh();
              router.back();
            } catch (err) {
              Alert.alert("Couldn't block", errorMessage(err) ?? "Try again.");
            }
          },
        },
      ],
    );

  return (
    <Pressable
      hitSlop={12}
      accessibilityLabel="More"
      onPress={() =>
        showMenu(`@${user.username}`, [
          {
            label: "Report",
            onPress: () => router.push({ pathname: "/report", params: { userId: user.id, username: user.username } }),
          },
          { label: "Block", destructive: true, onPress: block },
        ])
      }
    >
      <Ionicons name="ellipsis-horizontal" color={colors.text} size={22} />
    </Pressable>
  );
}

export default function UserProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  if (!username) return <Loading />;
  // Profiles are only for signed-in people (and invite links may open before sign-in).
  return <AuthGate>{<ProfileBody username={username} />}</AuthGate>;
}
