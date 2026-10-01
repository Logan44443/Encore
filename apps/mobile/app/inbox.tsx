import type { PendingTag } from "@encore/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { api } from "@/api";
import { PersonRow, RowButton } from "@/components/PersonRow";
import { Poster } from "@/components/Poster";
import { AuthGate, Card, Empty, Loading, Muted, Screen, SectionTitle } from "@/components/ui";
import { errorMessage, formatDate } from "@/format";
import { useFriendRequests, usePendingTags, useRefreshFriends } from "@/friends";
import { colors } from "@/theme";

export default function InboxScreen() {
  return (
    <AuthGate>
      <Inbox />
    </AuthGate>
  );
}

function Inbox() {
  const requests = useFriendRequests();
  const tags = usePendingTags();
  const refresh = useRefreshFriends();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await action();
      await refresh();
    } catch (err) {
      Alert.alert("Something went wrong", errorMessage(err) ?? "Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (requests.isLoading || tags.isLoading) return <Loading />;
  const incoming = requests.data?.incoming ?? [];
  const pending = tags.data?.tags ?? [];
  return (
    <Screen refreshControl={<RefreshControl refreshing={requests.isRefetching || tags.isRefetching} onRefresh={refresh} />}>
      {!incoming.length && !pending.length ? <Empty title="You're all caught up" body="Friend requests and things friends watched with you show up here." /> : null}
      {incoming.length ? (
        <>
          <SectionTitle>Friend requests</SectionTitle>
          {incoming.map((r) => (
            <PersonRow
              key={r.id}
              user={r.user}
              action={
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <RowButton label="Accept" disabled={busy === r.id} onPress={() => act(r.id, () => api.friends.accept(r.id))} />
                  <RowButton label="Decline" tone="ghost" disabled={busy === r.id} onPress={() => act(r.id, () => api.friends.dismissRequest(r.id))} />
                </View>
              }
            />
          ))}
        </>
      ) : null}
      {pending.length ? (
        <>
          <SectionTitle>Watched with you</SectionTitle>
          {pending.map((t) => (
            <TagCard key={t.id} tag={t} busy={busy === t.id} act={(action) => act(t.id, action)} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function TagCard({ tag, busy, act }: { tag: PendingTag; busy: boolean; act: (action: () => Promise<unknown>) => Promise<void> }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const what = tag.title?.name ?? tag.show?.name ?? "something";
  const when = tag.date ? ` on ${formatDate(tag.date)}` : "";

  const logIt = () => {
    if (tag.title) {
      router.push({
        pathname: "/title/[type]/[id]",
        params: { type: tag.title.mediaType, id: String(tag.title.tmdbId), withId: tag.by.id, withName: tag.by.displayName },
      });
      return;
    }
    if (tag.show) {
      void act(async () => {
        const { show } = await api.live.copy(tag.show!.id);
        queryClient.invalidateQueries({ queryKey: ["live"] });
        router.push(`/show/${show.id}`);
      });
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        {tag.title ? <Poster uri={tag.title.posterUrl} name={tag.title.name} width={44} /> : null}
        <Text style={{ color: colors.text, flex: 1, lineHeight: 20 }}>
          <Text style={{ fontWeight: "800" }}>{tag.by.displayName}</Text> says you watched{" "}
          <Text style={{ fontWeight: "800" }}>{what}</Text> together{when}.
          {tag.show?.venue ? <Text style={{ color: colors.muted }}> {tag.show.venue}</Text> : null}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <RowButton label={tag.show ? "Add to my shows" : "Log it too"} disabled={busy} onPress={logIt} />
        <RowButton label="Confirm" tone="ghost" disabled={busy} onPress={() => act(() => api.companions.confirm(tag.id))} />
        <RowButton label="Not me" tone="ghost" disabled={busy} onPress={() => act(() => api.companions.remove(tag.id))} />
      </View>
      <Muted>{tag.show ? "Adding it copies the lineup and setlist so you only need to rate it." : "Confirming shows it on both your profiles."}</Muted>
    </Card>
  );
}
