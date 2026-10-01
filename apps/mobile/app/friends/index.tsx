import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, RefreshControl, View } from "react-native";
import { api } from "@/api";
import { PersonRow, RowButton } from "@/components/PersonRow";
import { AuthGate, Button, Empty, ErrorText, Loading, Screen, SectionTitle, Segmented } from "@/components/ui";
import { errorMessage } from "@/format";
import { useFriendRequests, useFriends, useRefreshFriends } from "@/friends";

export default function FriendsScreen() {
  return (
    <AuthGate>
      <Friends />
    </AuthGate>
  );
}

function Friends() {
  const router = useRouter();
  const friends = useFriends();
  const requests = useFriendRequests();
  const refresh = useRefreshFriends();
  const waiting = requests.data?.incoming.length ?? 0;
  const [tab, setTab] = useState<"friends" | "requests">(waiting ? "requests" : "friends");
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

  const refreshing = friends.isRefetching || requests.isRefetching;
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Button label="Add friends" onPress={() => router.push("/friends/add")} />
      <Segmented
        options={[
          { value: "friends", label: "Friends" },
          { value: "requests", label: waiting ? `Requests (${waiting})` : "Requests" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "friends" ? (
        friends.isLoading ? (
          <Loading />
        ) : friends.error ? (
          <ErrorText error={friends.error} />
        ) : friends.data?.friends.length ? (
          <View style={{ gap: 8 }}>
            {friends.data.friends.map((f) => (
              <PersonRow key={f.id} user={f} />
            ))}
          </View>
        ) : (
          <Empty title="No friends yet" body="Find people by username, or share your profile link so friends can add you." />
        )
      ) : requests.isLoading ? (
        <Loading />
      ) : requests.error ? (
        <ErrorText error={requests.error} />
      ) : (
        <>
          <SectionTitle>Waiting for you</SectionTitle>
          {requests.data?.incoming.length ? (
            <View style={{ gap: 8 }}>
              {requests.data.incoming.map((r) => (
                <PersonRow
                  key={r.id}
                  user={r.user}
                  action={
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <RowButton label="Accept" disabled={busy === r.id} onPress={() => act(r.id, () => api.friends.accept(r.id))} />
                      <RowButton
                        label="Decline"
                        tone="ghost"
                        disabled={busy === r.id}
                        onPress={() => act(r.id, () => api.friends.dismissRequest(r.id))}
                      />
                    </View>
                  }
                />
              ))}
            </View>
          ) : (
            <Empty title="No requests" />
          )}
          <SectionTitle>Sent</SectionTitle>
          {requests.data?.outgoing.length ? (
            <View style={{ gap: 8 }}>
              {requests.data.outgoing.map((r) => (
                <PersonRow
                  key={r.id}
                  user={r.user}
                  action={
                    <RowButton label="Cancel" tone="ghost" disabled={busy === r.id} onPress={() => act(r.id, () => api.friends.dismissRequest(r.id))} />
                  }
                />
              ))}
            </View>
          ) : (
            <Empty title="Nothing waiting on others" />
          )}
        </>
      )}
    </Screen>
  );
}
