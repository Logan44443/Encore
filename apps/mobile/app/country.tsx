import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { AuthGate, ErrorText, Field, Loading, Muted, Screen } from "@/components/ui";
import { countryName, deviceRegion, flag } from "@/region";
import { colors } from "@/theme";

export default function CountryScreen() {
  return (
    <AuthGate>
      <CountryPicker />
    </AuthGate>
  );
}

function CountryPicker() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, setUser } = useAuth();
  const [query, setQuery] = useState("");
  const regions = useQuery({ queryKey: ["regions"], queryFn: () => api.catalog.regions(), staleTime: 24 * 60 * 60_000 });
  const phone = deviceRegion();

  const save = useMutation({
    mutationFn: (body: { country: string; manual: boolean; reset?: boolean }) => api.auth.setCountry(body),
    onSuccess: ({ user }) => {
      setUser(user);
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      router.back();
    },
  });

  const q = query.trim().toLowerCase();
  const list = (regions.data?.regions ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase() === q);
  const current = user?.country;

  return (
    <Screen>
      <Muted>
        Used to show where movies and shows are streaming. Only your country is saved, never your location.
      </Muted>

      {phone && (
        <Row
          label={`Use my phone's region (${countryName(phone)})`}
          sub={user?.countryManual ? "Follows your iPhone's Language & Region setting" : "Currently in use"}
          code={phone}
          active={!user?.countryManual}
          onPress={() => save.mutate({ country: phone, manual: false, reset: true })}
        />
      )}

      <Field label="Search countries" value={query} onChangeText={setQuery} autoCorrect={false} />
      <ErrorText error={regions.error ?? save.error} />

      {regions.isLoading ? (
        <Loading />
      ) : (
        <View style={{ gap: 6 }}>
          {list.map((r) => (
            <Row
              key={r.code}
              label={r.name}
              code={r.code}
              active={!!user?.countryManual && current === r.code}
              onPress={() => save.mutate({ country: r.code, manual: true })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function Row({ label, sub, code, active, onPress }: { label: string; sub?: string; code: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, active && styles.rowActive]}>
      <Text style={styles.flag}>{flag(code)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      {active ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 },
  rowActive: { borderColor: colors.brand },
  flag: { fontSize: 22 },
  label: { color: colors.text, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  check: { color: colors.brand, fontWeight: "900", fontSize: 16 },
});
