import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { AuthGate, Button, ErrorText, Field, H1, Muted, Screen } from "@/components/ui";

export default function DeleteAccountScreen() {
  return (
    <AuthGate>
      <DeleteAccount />
    </AuthGate>
  );
}

function DeleteAccount() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      await api.account.delete({ password });
      await signOut();
      router.dismissTo("/");
      Alert.alert("Account deleted", "Your account and everything you logged have been removed.");
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  const confirm = () =>
    Alert.alert("Delete your account?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void remove() },
    ]);

  return (
    <Screen>
      <H1>Delete account</H1>
      <Muted>
        This permanently deletes @{user?.username} and everything you've logged: your rankings, seasons, live shows
        and watchlist. It can't be undone.
      </Muted>
      <Field label="Enter your password to confirm" value={password} onChangeText={setPassword} secureTextEntry />
      <ErrorText error={error} />
      <Button label={pending ? "…" : "Delete my account"} tone="danger" disabled={pending || !password} onPress={confirm} />
    </Screen>
  );
}
