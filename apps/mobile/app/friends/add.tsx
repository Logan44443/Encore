import type { Person } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { Alert, Share, View } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { PersonRow, RowButton } from "@/components/PersonRow";
import { AuthGate, Button, Empty, ErrorText, Field, Loading, Muted, Screen } from "@/components/ui";
import { errorMessage } from "@/format";
import { useRefreshFriends } from "@/friends";

export default function AddFriendsScreen() {
  return (
    <AuthGate>
      <AddFriends />
    </AuthGate>
  );
}

/** Waits for typing to pause before searching. */
function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function AddFriends() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const refresh = useRefreshFriends();
  const search = useQuery({
    queryKey: ["people", q],
    queryFn: () => api.users.search(q),
    enabled: q.replace(/^@/, "").length >= 2,
  });
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (person: Person) => {
    setBusy(person.id);
    try {
      // When they already asked you, this accepts their request.
      await api.friends.request({ username: person.username });
      await refresh();
    } catch (err) {
      Alert.alert("Couldn't send request", errorMessage(err) ?? "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const shareProfile = () => {
    if (!user) return;
    const link = Linking.createURL(`/user/${user.username}`);
    void Share.share({ message: `Add me on Encore: @${user.username}\n${link}` });
  };

  const action = (p: Person) => {
    switch (p.relationship) {
      case "friend":
        return <RowButton label="Friends" tone="ghost" disabled onPress={() => {}} />;
      case "requested":
        return <RowButton label="Requested" tone="ghost" disabled onPress={() => {}} />;
      case "incoming":
        return <RowButton label="Accept" disabled={busy === p.id} onPress={() => add(p)} />;
      default:
        return <RowButton label="Add" disabled={busy === p.id} onPress={() => add(p)} />;
    }
  };

  return (
    <Screen>
      <Field
        label="Search"
        value={query}
        onChangeText={setQuery}
        placeholder="Username or name"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        clearButtonMode="while-editing"
      />
      {q.replace(/^@/, "").length < 2 ? (
        <>
          <Muted>Friends see your rankings and shows. You can change who sees what in Settings, under Privacy.</Muted>
          <Button label="Share my profile" tone="ghost" onPress={shareProfile} />
        </>
      ) : search.isLoading ? (
        <Loading />
      ) : search.error ? (
        <ErrorText error={search.error} />
      ) : search.data?.users.length ? (
        <View style={{ gap: 8 }}>
          {search.data.users.map((p) => (
            <PersonRow key={p.id} user={p} action={action(p)} />
          ))}
        </View>
      ) : (
        <Empty title="Nobody found" body="Check the spelling, or ask them for their username." />
      )}
    </Screen>
  );
}
