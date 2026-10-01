import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { Button, ErrorText, Field, H1, Muted, Screen } from "@/components/ui";
import { deviceRegion } from "@/region";
import { colors } from "@/theme";

export default function Register() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await api.auth.register({
        email,
        username: username.trim(),
        password,
        country: deviceRegion() ?? undefined,
      });
      await signIn(res);
      router.replace("/");
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen>
      <H1>Join Encore</H1>
      <Muted>Rank everything you watch and every show you see.</Muted>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <ErrorText error={error} />
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
        By creating an account you agree to the{" "}
        <Text style={{ color: colors.brand, fontWeight: "700" }} onPress={() => router.push("/guidelines")}>
          community guidelines
        </Text>
        .
      </Text>
      <Button label={pending ? "…" : "Create account"} disabled={pending || password.length < 8 || username.length < 3} onPress={submit} />
      <Pressable onPress={() => router.replace("/login")}>
        <Text style={{ color: colors.brand, fontWeight: "700" }}>Already have an account? Sign in</Text>
      </Pressable>
    </Screen>
  );
}
