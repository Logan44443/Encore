import { RESET_CODE_LENGTH } from "@encore/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { Button, ErrorText, Field, H1, Muted, Screen } from "@/components/ui";
import { colors } from "@/theme";

/** Two steps: email a one-time code, then enter it with a new password. Signs in on success. */
export default function ForgotPassword() {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; next?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const run = async (task: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const address = email.trim();
      await api.passwordReset.request({ email: address });
      setSentTo(address);
      setCode("");
    });

  const reset = () =>
    run(async () => {
      if (!sentTo) return;
      await api.passwordReset.confirm({ email: sentTo, code, password });
      await signIn(await api.auth.login({ login: sentTo, password }));
      const next = params.next;
      // Only follow in-app paths, never a URL a deep link smuggled in.
      if (next && next.startsWith("/") && !next.startsWith("//")) router.replace(next as "/");
      else router.back();
    });

  const backToSignIn = (
    <Pressable onPress={() => router.replace({ pathname: "/login", params: params.next ? { next: params.next } : {} })}>
      <Text style={{ color: colors.brand, fontWeight: "700" }}>Back to sign in</Text>
    </Pressable>
  );

  if (!sentTo) {
    return (
      <Screen>
        <H1>Forgot your password?</H1>
        <Muted>Enter the email you signed up with and we'll send you a code to reset it.</Muted>
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
        <ErrorText error={error} />
        <Button label={pending ? "…" : "Send code"} disabled={pending || !email.includes("@")} onPress={sendCode} />
        {backToSignIn}
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>Check your email</H1>
      <Muted>
        If {sentTo} has an Encore account, we've sent it a {RESET_CODE_LENGTH}-digit code. It expires in 15 minutes.
      </Muted>
      <Field
        label="Code"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, RESET_CODE_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={RESET_CODE_LENGTH}
      />
      <Field
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <ErrorText error={error} />
      <Button
        label={pending ? "…" : "Reset password"}
        disabled={pending || code.length !== RESET_CODE_LENGTH || password.length < 8}
        onPress={reset}
      />
      <Button label="Send a new code" tone="ghost" disabled={pending} onPress={sendCode} />
      {backToSignIn}
    </Screen>
  );
}
