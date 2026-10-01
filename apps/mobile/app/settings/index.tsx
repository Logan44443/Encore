import { PROFILE_VISIBILITY_LABELS } from "@encore/shared";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { api } from "@/api";
import { useAuth, useCountry } from "@/auth";
import { AuthGate, Muted, Screen, SettingsGroup, SettingsRow } from "@/components/ui";
import { errorMessage } from "@/format";
import { countryName, flag } from "@/region";

export default function SettingsScreen() {
  return (
    <AuthGate>
      <Settings />
    </AuthGate>
  );
}

function Settings() {
  const { user, signIn, signOut } = useAuth();
  const country = useCountry();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (!user) return null;

  const signOutOthers = () =>
    Alert.alert("Sign out of other devices?", "Encore stays signed in on this phone only.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out others",
        style: "destructive",
        onPress: async () => {
          setPending(true);
          try {
            await signIn(await api.account.signOutOthers());
            Alert.alert("Done", "Every other device has been signed out.");
          } catch (err) {
            Alert.alert("Couldn't sign out other devices", errorMessage(err) ?? "Try again.");
          } finally {
            setPending(false);
          }
        },
      },
    ]);

  const confirmSignOut = () =>
    Alert.alert("Sign out?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.dismissTo("/");
        },
      },
    ]);

  const services = user.services.length;

  return (
    <Screen>
      <SettingsGroup title="Profile">
        <SettingsRow label="Name" value={user.displayName} onPress={() => router.push("/settings/profile")} />
        <SettingsRow label="Username" value={`@${user.username}`} onPress={() => router.push("/settings/profile")} last />
      </SettingsGroup>

      <SettingsGroup title="Friends and privacy">
        <SettingsRow label="Friends" onPress={() => router.push("/friends")} />
        <SettingsRow label="Privacy" value={PROFILE_VISIBILITY_LABELS[user.privacy.profileVisibility]} onPress={() => router.push("/settings/privacy")} />
        <SettingsRow label="Blocked accounts" onPress={() => router.push("/settings/blocked")} />
        <SettingsRow label="Community guidelines" onPress={() => router.push("/guidelines")} last />
      </SettingsGroup>

      <SettingsGroup title="Account">
        <SettingsRow label="Email" value={user.email} onPress={() => router.push("/settings/email")} last />
      </SettingsGroup>

      <SettingsGroup title="Security">
        <SettingsRow label="Change password" onPress={() => router.push("/settings/password")} />
        <SettingsRow
          label="Forgot password"
          onPress={() => router.push({ pathname: "/forgot-password", params: { email: user.email } })}
        />
        <SettingsRow label="Sign out of other devices" onPress={pending ? undefined : signOutOthers} last />
      </SettingsGroup>

      <SettingsGroup title="Streaming">
        <SettingsRow label="Country" value={`${flag(country)} ${countryName(country)}`} onPress={() => router.push("/country")} />
        <SettingsRow
          label="My services"
          value={services === 0 ? "None yet" : `${services} ${services === 1 ? "service" : "services"}`}
          onPress={() => router.push("/services")}
          last
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow label="Sign out" tone="danger" onPress={confirmSignOut} />
        <SettingsRow label="Delete account" tone="danger" onPress={() => router.push("/delete-account")} last />
      </SettingsGroup>

      <Muted>
        Encore {Constants.expoConfig?.version ?? ""}
        {"\n"}This product uses the TMDB API but is not endorsed or certified by TMDB.
      </Muted>
    </Screen>
  );
}
