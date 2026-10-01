import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, View } from "react-native";
import { api } from "@/api";
import { PersonRow, RowButton } from "@/components/PersonRow";
import { AuthGate, Empty, ErrorText, Loading, Muted, Screen } from "@/components/ui";
import { errorMessage } from "@/format";
import { useRefreshFriends } from "@/friends";

export default function BlockedScreen() {
  return (
    <AuthGate>
      <Blocked />
    </AuthGate>
  );
}

function Blocked() {
  const { data, error, isLoading } = useQuery({ queryKey: ["blocked"], queryFn: () => api.safety.blocked() });
  const refresh = useRefreshFriends();
  const [busy, setBusy] = useState<string | null>(null);

  const unblock = async (userId: string) => {
    setBusy(userId);
    try {
      await api.safety.unblock(userId);
      await refresh();
    } catch (err) {
      Alert.alert("Couldn't unblock", errorMessage(err) ?? "Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <Loading />;
  return (
    <Screen>
      <ErrorText error={error} />
      <Muted>Blocked people can't find you, see your profile or send you requests. Unblocking doesn't make you friends again.</Muted>
      {data?.users.length ? (
        <View style={{ gap: 8 }}>
          {data.users.map((u) => (
            <PersonRow key={u.id} user={u} link={false} action={<RowButton label="Unblock" tone="ghost" disabled={busy === u.id} onPress={() => unblock(u.id)} />} />
          ))}
        </View>
      ) : (
        <Empty title="You haven't blocked anyone" />
      )}
    </Screen>
  );
}
