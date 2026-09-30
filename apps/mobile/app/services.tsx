import type { WatchProvider } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "@/api";
import { useAuth, useCountry } from "@/auth";
import { FEED_KEY } from "@/components/Feed";
import { AuthGate, Empty, ErrorText, Field, Loading, Muted, Screen } from "@/components/ui";
import { countryName, flag } from "@/region";
import { colors } from "@/theme";

export default function ServicesScreen() {
  return (
    <AuthGate>
      <ServicesPicker />
    </AuthGate>
  );
}

/**
 * "My services": tap the streaming services you pay for. Each tap saves the whole
 * list, and only the newest save's answer is applied, so fast taps can't undo each other.
 */
function ServicesPicker() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, setUser } = useAuth();
  const country = useCountry();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>(user?.services ?? []);
  const latest = useRef(0);
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - 16 * 2 - 10 * 3) / 4);

  const services = useQuery({
    queryKey: ["services", country],
    queryFn: () => api.catalog.services(country),
    staleTime: 24 * 60 * 60_000,
  });

  const save = useMutation({
    mutationFn: async ({ ids, seq }: { ids: number[]; seq: number }) => ({ ...(await api.auth.setServices({ providerIds: ids })), seq }),
    onSuccess: ({ user, seq }) => {
      if (seq !== latest.current) return;
      setUser(user);
      queryClient.invalidateQueries({ queryKey: FEED_KEY });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  const toggle = (id: number) => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    setSelected(next);
    save.mutate({ ids: next, seq: ++latest.current });
  };

  const all = services.data?.services ?? [];
  const q = query.trim().toLowerCase();
  const list = all.filter((s) => !q || s.name.toLowerCase().includes(q));
  const mine = list.filter((s) => selected.includes(s.id));
  const rest = list.filter((s) => !selected.includes(s.id));

  return (
    <Screen>
      <Muted>
        Pick the services you pay for. Recommendations you can watch on them move up and show where they're streaming.
      </Muted>
      <Pressable onPress={() => router.push("/country")} hitSlop={8}>
        <Text style={styles.country}>
          Services in {flag(country)} {countryName(country)} <Text style={{ color: colors.brand }}>Change</Text>
        </Text>
      </Pressable>

      <ErrorText error={services.error ?? save.error} />

      {services.isLoading ? (
        <Loading />
      ) : all.length === 0 ? (
        <Empty title="No streaming data here" body={`There's no streaming data for ${countryName(country)} right now.`} />
      ) : (
        <>
          <Field label="Search services" value={query} onChangeText={setQuery} autoCorrect={false} />
          {mine.length > 0 && <Grid label={`Yours (${mine.length})`} items={mine} tile={tile} selected onPress={toggle} />}
          <Grid label={mine.length ? "More services" : "All services"} items={rest} tile={tile} onPress={toggle} />
        </>
      )}
    </Screen>
  );
}

function Grid({
  label,
  items,
  tile,
  selected = false,
  onPress,
}: {
  label: string;
  items: WatchProvider[];
  tile: number;
  selected?: boolean;
  onPress: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.grid}>
        {items.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => onPress(s.id)}
            style={{ width: tile, alignItems: "center", gap: 4 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={s.name}
          >
            <View>
              {s.logoUrl ? (
                <Image source={{ uri: s.logoUrl }} style={[styles.logo, selected && styles.logoOn]} contentFit="cover" />
              ) : (
                <View style={[styles.logo, styles.fallback, selected && styles.logoOn]}>
                  <Text style={styles.letter}>{s.name.slice(0, 1)}</Text>
                </View>
              )}
              {selected && (
                <View style={styles.tick}>
                  <Text style={styles.tickText}>✓</Text>
                </View>
              )}
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {s.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  country: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  logo: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.panel2, borderWidth: 2, borderColor: "transparent" },
  logoOn: { borderColor: colors.brand },
  fallback: { alignItems: "center", justifyContent: "center" },
  letter: { color: colors.text, fontWeight: "800" },
  tick: {
    position: "absolute",
    right: -4,
    top: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  tickText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  name: { color: colors.text, fontSize: 10, textAlign: "center" },
});
