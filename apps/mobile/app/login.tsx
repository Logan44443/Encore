import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { Button, ErrorText, Field, H1, Muted, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const next = useLocalSearchParams<{ next?: string }>().next;
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await api.auth.login({ login, password });
      await signIn(res);
      if (next) router.replace(next as "/");
      else router.back();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen>
      <H1>Welcome back</H1>
      <Muted>Sign in to keep ranking.</Muted>
      <Field label="Email or username" value={login} onChangeText={setLogin} autoCapitalize="none" autoCorrect={false} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <ErrorText error={error} />
      <Button label={pending ? "…" : "Sign in"} disabled={pending || !login || !password} onPress={submit} />
      <Pressable onPress={() => router.replace("/register")}>
        <Text style={{ color: colors.brand, fontWeight: "700" }}>Create an account</Text>
      </Pressable>
    </Screen>
  );
}
