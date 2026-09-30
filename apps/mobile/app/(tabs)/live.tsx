import { SHOW_KIND_LABELS } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { api } from "@/api";
import { AuthGate, Button, Card, Empty, ErrorText, H1, Loading, Muted, Screen } from "@/components/ui";
import { formatPlace, showTitle, supportLine } from "@/format";
import { colors } from "@/theme";

function LiveList() {
  const router = useRouter();
  const { data, error, isLoading } = useQuery({ queryKey: ["live"], queryFn: () => api.live.list() });
  const shows = data?.shows ?? [];
  const performers = new Set(shows.flatMap((s) => s.lineup.map((l) => l.performer.mbid ?? l.performer.name)));
  const cities = new Set(shows.map((s) => s.venue?.city?.toLowerCase()).filter(Boolean));
  const byYear = new Map<string, typeof shows>();
  for (const s of shows) byYear.set(s.date.slice(0, 4), [...(byYear.get(s.date.slice(0, 4)) ?? []), s]);

  return (
    <Screen>
      <H1>Live</H1>
      <Muted>Every show you've been to — who played, where, and what hit.</Muted>
      <Button label="Add a show" onPress={() => router.push("/show/new")} />
      {shows.length > 0 && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            ["Shows", shows.length],
            ["Performers", performers.size],
            ["Cities", cities.size],
          ].map(([label, value]) => (
            <Card key={String(label)} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900" }}>{value}</Text>
              <Muted>{label}</Muted>
            </Card>
          ))}
        </View>
      )}
      <ErrorText error={error} />
      {isLoading ? (
        <Loading />
      ) : shows.length === 0 ? (
        <Empty title="No shows yet" body="Add the last show you saw — lineup, venue, and setlist." />
      ) : (
        [...byYear.entries()].map(([year, list]) => (
          <View key={year} style={{ gap: 8 }}>
            <Text style={{ color: colors.muted, fontWeight: "800" }}>{year}</Text>
            {list.map((s) => {
              const place = formatPlace(s.venue);
              return (
                <Pressable key={s.id} onPress={() => router.push(`/show/${s.id}`)} style={{ backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4 }}>
                  <Muted>
                    {s.date} · {SHOW_KIND_LABELS[s.kind]}
                  </Muted>
                  <Text style={{ color: colors.text, fontWeight: "800" }}>{showTitle(s)}</Text>
                  {supportLine(s) ? <Muted>{supportLine(s)}</Muted> : null}
                  {s.venue ? <Muted>{s.venue.name}{place ? ` · ${place}` : ""}</Muted> : null}
                  {s.rating !== null && <Text style={{ color: colors.brand, fontWeight: "800" }}>{s.rating.toFixed(1)}</Text>}
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </Screen>
  );
}

export default function LiveScreen() {
  return (
    <AuthGate>
      <LiveList />
    </AuthGate>
  );
}
