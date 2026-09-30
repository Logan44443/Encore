import { useRouter } from "expo-router";
import { useState } from "react";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { AuthGate, Button, ErrorText, Field, Muted, Screen } from "@/components/ui";

export default function ChangeEmailScreen() {
  return (
    <AuthGate>
      <ChangeEmail />
    </AuthGate>
  );
}

function ChangeEmail() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  if (!user) return null;

  const address = email.trim();
  const changed = address.toLowerCase() !== user.email;

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      setUser((await api.account.changeEmail({ email: address, password })).user);
      router.back();
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  return (
    <Screen>
      <Muted>You sign in with this email, and password reset codes are sent to it, so make sure it's one you can open.</Muted>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
      />
      <Field
        label="Current password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
      />
      <ErrorText error={error} />
      <Button
        label={pending ? "…" : "Change email"}
        disabled={pending || !changed || !address.includes("@") || !password}
        onPress={save}
      />
    </Screen>
  );
}
