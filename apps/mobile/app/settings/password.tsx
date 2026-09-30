import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { AuthGate, Button, ErrorText, Field, Muted, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function ChangePasswordScreen() {
  return (
    <AuthGate>
      <ChangePassword />
    </AuthGate>
  );
}

function ChangePassword() {
  const { user, signIn } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  if (!user) return null;

  const mismatch = confirm.length > 0 && confirm !== next;

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      // The server signs out every other device and hands this one a fresh session.
      await signIn(await api.account.changePassword({ currentPassword: current, newPassword: next }));
      router.back();
      Alert.alert("Password changed", "You've been signed out on your other devices.");
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  return (
    <Screen>
      <Field
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
      />
      <Field
        label="New password"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <Field
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
      />
      {mismatch ? <ErrorText error={new Error("The new passwords don't match")} /> : <ErrorText error={error} />}
      <Muted>Changing your password signs you out everywhere except this phone.</Muted>
      <Button
        label={pending ? "…" : "Change password"}
        disabled={pending || !current || next.length < 8 || next !== confirm}
        onPress={save}
      />
      <Pressable onPress={() => router.replace({ pathname: "/forgot-password", params: { email: user.email } })}>
        <Text style={{ color: colors.brand, fontWeight: "700" }}>Forgot your current password?</Text>
      </Pressable>
    </Screen>
  );
}
