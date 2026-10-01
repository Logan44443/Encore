import { PROFILE_VISIBILITIES, PROFILE_VISIBILITY_LABELS, type UpdatePrivacyInput } from "@encore/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { AuthGate, Muted, Screen, SettingsGroup, SettingsRow, ToggleRow } from "@/components/ui";
import { errorMessage } from "@/format";

export default function PrivacyScreen() {
  return (
    <AuthGate>
      <Privacy />
    </AuthGate>
  );
}

const VISIBILITY_DETAIL = {
  private: "Nobody else sees your rankings or shows. People can still find you and send requests.",
  friends: "Only friends see your rankings, scores and live shows.",
  public: "Anyone signed in to Encore sees your rankings and shows. Reviews and notes stay friends-only.",
};

function Privacy() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  if (!user) return null;
  const { privacy } = user;

  const save = async (change: UpdatePrivacyInput) => {
    setPending(true);
    try {
      setUser((await api.account.updatePrivacy(change)).user);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (err) {
      Alert.alert("Couldn't save", errorMessage(err) ?? "Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen>
      <SettingsGroup title="Who can see my profile">
        {PROFILE_VISIBILITIES.map((v, i) => (
          <SettingsRow
            key={v}
            label={`${privacy.profileVisibility === v ? "✓  " : ""}${PROFILE_VISIBILITY_LABELS[v]}`}
            onPress={pending || privacy.profileVisibility === v ? undefined : () => save({ profileVisibility: v })}
            last={i === PROFILE_VISIBILITIES.length - 1}
          />
        ))}
      </SettingsGroup>
      <Muted>{VISIBILITY_DETAIL[privacy.profileVisibility]}</Muted>

      <SettingsGroup title="Friends">
        <ToggleRow
          label="Share my reviews with friends"
          detail="Reviews and live show notes. Nobody else ever sees them."
          value={privacy.shareReviews}
          disabled={pending}
          onChange={(shareReviews) => save({ shareReviews })}
        />
        <ToggleRow
          label="Allow friend requests"
          value={privacy.allowFriendRequests}
          disabled={pending}
          onChange={(allowFriendRequests) => save({ allowFriendRequests })}
        />
        <ToggleRow
          label="Show me in search"
          detail="When off, people need your profile link to find you."
          value={privacy.searchable}
          disabled={pending}
          onChange={(searchable) => save({ searchable })}
          last
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow label="Blocked accounts" onPress={() => router.push("/settings/blocked")} last />
      </SettingsGroup>
    </Screen>
  );
}
