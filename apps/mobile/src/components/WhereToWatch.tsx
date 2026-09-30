import type { MediaType, WatchProvider } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { useAuth, useCountry } from "../auth";
import { countryName, flag } from "../region";
import { colors } from "../theme";
import { Loading, Muted } from "./ui";

export function WhereToWatch({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const country = useCountry();
  const { data, isLoading } = useQuery({
    queryKey: ["providers", mediaType, tmdbId, country],
    queryFn: () => api.catalog.providers(mediaType, tmdbId, country),
    staleTime: 60 * 60_000,
  });
  const p = data?.providers;
  const link = p?.link;
  const groups: [string, WatchProvider[]][] = p
    ? ([
        ["Stream", p.stream],
        ["Free", p.free],
        ["Rent", p.rent],
        ["Buy", p.buy],
      ] as [string, WatchProvider[]][]).filter(([, list]) => list.length > 0)
    : [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Where to watch</Text>
        <Pressable onPress={() => router.push(user ? "/country" : "/login")} hitSlop={8}>
          <Text style={styles.country}>
            {flag(country)} {countryName(country)} <Text style={{ color: colors.brand }}>Change</Text>
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Loading />
      ) : groups.length ? (
        groups.map(([label, list]) => (
          <View key={label} style={{ gap: 6 }}>
            <Text style={styles.label}>{label}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {list.map((provider) => (
                <Pressable
                  key={provider.id}
                  onPress={() => link && Linking.openURL(link)}
                  style={styles.provider}
                  accessibilityLabel={`${label} on ${provider.name}`}
                >
                  {provider.logoUrl ? (
                    <Image source={{ uri: provider.logoUrl }} style={styles.logo} contentFit="cover" />
                  ) : (
                    <View style={[styles.logo, styles.logoFallback]}>
                      <Text style={styles.logoLetter}>{provider.name.slice(0, 1)}</Text>
                    </View>
                  )}
                  <Text style={styles.providerName} numberOfLines={2}>
                    {provider.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ))
      ) : (
        <Muted>Not available to stream, rent, or buy in {countryName(country)} right now.</Muted>
      )}

      {groups.length > 0 && (
        <Pressable onPress={() => link && Linking.openURL(link)} disabled={!link}>
          <Text style={styles.credit}>Streaming data from JustWatch{link ? " · See all options" : ""}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { color: colors.text, fontWeight: "800", fontSize: 16 },
  country: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  provider: { width: 64, alignItems: "center", gap: 4 },
  logo: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.panel2 },
  logoFallback: { alignItems: "center", justifyContent: "center" },
  logoLetter: { color: colors.text, fontWeight: "800" },
  providerName: { color: colors.text, fontSize: 10, textAlign: "center" },
  credit: { color: colors.muted, fontSize: 11 },
});
