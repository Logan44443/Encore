import { REPORT_REASON_LABELS, REPORT_REASONS, type ReportKind, type ReportReason } from "@encore/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { api } from "@/api";
import { AuthGate, Button, ErrorText, Field, Muted, Screen, SettingsGroup, SettingsRow, ToggleRow } from "@/components/ui";
import { useRefreshFriends } from "@/friends";

export default function ReportScreen() {
  return (
    <AuthGate>
      <Report />
    </AuthGate>
  );
}

/** Report a person, or something they wrote (kind + targetId). Opened as a modal. */
function Report() {
  const params = useLocalSearchParams<{ userId: string; username: string; kind?: ReportKind; targetId?: string }>();
  const router = useRouter();
  const refresh = useRefreshFriends();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const kind = params.kind ?? "user";

  const submit = async () => {
    if (!reason) return;
    setPending(true);
    setError(null);
    try {
      await api.safety.report({ userId: params.userId, kind, targetId: params.targetId ?? null, reason, details: details.trim() || null, block });
      if (block) await refresh();
      Alert.alert("Thanks for telling us", "We review every report and act on it within a day.");
      if (block) router.dismissTo("/");
      else router.back();
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  return (
    <Screen>
      <Muted>
        {kind === "user" ? `Why are you reporting @${params.username}?` : `What's wrong with what @${params.username} wrote?`} They
        won't know who reported them.
      </Muted>
      <SettingsGroup title="Reason">
        {REPORT_REASONS.map((r, i) => (
          <SettingsRow
            key={r}
            label={`${reason === r ? "✓  " : ""}${REPORT_REASON_LABELS[r]}`}
            onPress={() => setReason(r)}
            last={i === REPORT_REASONS.length - 1}
          />
        ))}
      </SettingsGroup>
      <Field label="Anything else (optional)" value={details} onChangeText={setDetails} multiline maxLength={1000} />
      <SettingsGroup>
        <ToggleRow label={`Also block @${params.username}`} value={block} onChange={setBlock} last />
      </SettingsGroup>
      <ErrorText error={error} />
      <Button label={pending ? "…" : "Send report"} disabled={!reason || pending} onPress={submit} />
    </Screen>
  );
}
