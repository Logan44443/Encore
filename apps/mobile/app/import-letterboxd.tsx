import type { LetterboxdImport, LetterboxdUnmatched, SearchResult } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/api";
import { RowButton } from "@/components/PersonRow";
import { Poster } from "@/components/Poster";
import { AuthGate, Button, Card, ErrorText, Field, H1, Loading, Muted, Screen, SectionTitle } from "@/components/ui";
import { errorMessage } from "@/format";
import { colors } from "@/theme";

/** Letterboxd's "Import & Export" settings page. Opens in the Letterboxd app when it handles the link, otherwise Safari. */
const EXPORT_URL = "https://letterboxd.com/settings/data/";
const KEY = ["letterboxd-import"] as const;

export default function ImportLetterboxdScreen() {
  return (
    <AuthGate>
      <ImportLetterboxd />
    </AuthGate>
  );
}

function ImportLetterboxd() {
  const queryClient = useQueryClient();
  const [startOver, setStartOver] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: api.letterboxd.status,
    refetchInterval: (q) => (q.state.data?.import?.status === "running" ? 1500 : false),
  });
  const current = data?.import ?? null;

  // When an import finishes, everything it touched (rankings, watchlist, profile, picks) is stale.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (current?.status === "running") wasRunning.current = true;
    else if (wasRunning.current && current) {
      wasRunning.current = false;
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== KEY[0] });
    }
  }, [current, queryClient]);

  const upload = useMutation({
    mutationFn: async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/x-zip-compressed", "text/csv", "text/comma-separated-values"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return null;
      const form = new FormData();
      for (const file of picked.assets) {
        // React Native's FormData takes a { uri, name, type } object for a file on disk.
        form.append("files", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as unknown as Blob);
      }
      return api.letterboxd.start(form);
    },
    onSuccess: (res) => {
      if (!res) return;
      queryClient.setQueryData(KEY, res);
      setStartOver(false);
    },
    onError: (err) => Alert.alert("Couldn't import that file", errorMessage(err) ?? "Try again."),
  });

  if (isLoading) return <Loading />;
  if (current?.status === "running") return <Progress current={current} />;
  if (current && !startOver) return <Results current={current} onImportAgain={() => setStartOver(true)} />;

  return (
    <Screen>
      <H1>Import from Letterboxd</H1>
      <Muted>Bring over your ratings, diary dates, reviews and watchlist. Your star ratings become your Encore scores.</Muted>
      <ErrorText error={error} />

      <Card>
        <Step n={1} text={'Open Letterboxd\'s export page and tap "Export your data". Sign in first if it asks.'} />
        <Step n={2} text="Letterboxd downloads a ZIP file. It's saved to Downloads in the Files app." />
        <Step n={3} text="Come back here and choose that ZIP file." />
      </Card>

      <Button label="Open Letterboxd" tone="ghost" onPress={() => Linking.openURL(EXPORT_URL).catch(() => Alert.alert("Couldn't open Letterboxd", EXPORT_URL))} />
      <Button label={upload.isPending ? "Uploading…" : "Choose the export file"} disabled={upload.isPending} onPress={() => upload.mutate()} />

      <Muted>
        How scores carry over: each film's score is its stars doubled, so 4★ is 8.0. 3½★ and up is "I liked it", 2★ to 3★ is "It was
        fine", and 1½★ or less is "I didn't like it". Films with the same stars tie; re-rank any of them from its page to break the tie.
        Films you've already ranked in Encore keep your ranking, so importing again is safe.
      </Muted>
      {current && startOver ? <Button label="Back to my last import" tone="ghost" onPress={() => setStartOver(false)} /> : null}
    </Screen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function Progress({ current }: { current: LetterboxdImport }) {
  const share = current.total > 0 ? current.done / current.total : 0;
  return (
    <Screen>
      <H1>Importing…</H1>
      <Muted>
        Matching your films: {current.done} of {current.total}. You can leave this screen; the import keeps going.
      </Muted>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.round(share * 100)}%` }]} />
      </View>
    </Screen>
  );
}

function Results({ current, onImportAgain }: { current: LetterboxdImport; onImportAgain: () => void }) {
  const router = useRouter();
  const { counts } = current;
  const lines = [
    counts.ranked > 0 && `${counts.ranked} ${plural(counts.ranked, "film")} added to your rankings`,
    counts.alreadyRanked > 0 && `${counts.alreadyRanked} already ranked in Encore (left as they were)`,
    counts.watchlisted > 0 && `${counts.watchlisted} added to your watchlist`,
    counts.notRated > 0 && `${counts.notRated} watched but not rated`,
    counts.unmatched > 0 && `${counts.unmatched} couldn't be matched yet`,
  ].filter((l): l is string => !!l);

  return (
    <Screen>
      <H1>{current.status === "failed" ? "Import stopped" : "Import finished"}</H1>
      {current.error ? <Text style={{ color: colors.disliked }}>{current.error}</Text> : null}
      <Card>
        {lines.length > 0 ? lines.map((l) => <Text key={l} style={styles.summary}>{l}</Text>) : <Muted>Nothing new to import.</Muted>}
      </Card>

      {current.unmatched.length > 0 ? (
        <>
          <SectionTitle>Find these films</SectionTitle>
          <Muted>Encore wasn't sure which film these are. Search for each one, or skip it.</Muted>
          {current.unmatched.map((u) => (
            <UnmatchedRow key={u.key} item={u} />
          ))}
        </>
      ) : null}

      {current.notRated.length > 0 ? (
        <>
          <SectionTitle>Watched but not rated</SectionTitle>
          <Muted>These have no stars on Letterboxd, so there was nothing to rank them by. Tap one to rank it.</Muted>
          {current.notRated.map((t) => (
            <Pressable key={t.tmdbId} style={styles.row} onPress={() => router.push(`/title/movie/${t.tmdbId}`)}>
              <Poster uri={t.posterUrl} name={t.name} width={40} />
              <Text style={styles.rowName} numberOfLines={2}>
                {t.name}
                {t.year ? <Text style={styles.meta}> {t.year}</Text> : null}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <Button
        label="See my rankings"
        onPress={() => {
          router.dismissAll();
          router.navigate("/lists");
        }}
      />
      <Button label="Import another export" tone="ghost" onPress={onImportAgain} />
    </Screen>
  );
}

function stars(rating: number): string {
  return "★".repeat(Math.floor(rating)) + (rating % 1 ? "½" : "");
}

function plural(n: number, word: string) {
  return n === 1 ? word : `${word}s`;
}

/** A film the import couldn't place: search the catalog for it, or skip it. */
function UnmatchedRow({ item }: { item: LetterboxdUnmatched }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(item.name);
  const search = useQuery({
    queryKey: ["catalog-search", "movie", q.trim()],
    queryFn: () => api.catalog.search("movie", q.trim()),
    enabled: open && q.trim().length > 1,
  });
  const fix = useMutation({
    mutationFn: (tmdbId: number | undefined) => api.letterboxd.fix({ key: item.key, tmdbId }),
    onSuccess: (res, tmdbId) => {
      queryClient.setQueryData(KEY, res);
      if (tmdbId !== undefined) queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== KEY[0] });
    },
    onError: (err) => Alert.alert("Couldn't save that", errorMessage(err) ?? "Try again."),
  });

  const detail = [
    item.year,
    item.kind === "watchlist" ? "Watchlist" : item.rating ? stars(item.rating) : "Watched, no rating",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.unmatched}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.meta}>{detail}</Text>
        </View>
        <RowButton label={open ? "Close" : "Find"} tone={open ? "ghost" : "primary"} onPress={() => setOpen(!open)} disabled={fix.isPending} />
        <RowButton label="Skip" tone="ghost" onPress={() => fix.mutate(undefined)} disabled={fix.isPending} />
      </View>
      {open ? (
        <View style={{ gap: 8 }}>
          <Field label="Search" value={q} onChangeText={setQ} autoCorrect={false} returnKeyType="search" />
          {search.isFetching ? <Muted>Searching…</Muted> : null}
          <ErrorText error={search.error} />
          {(search.data?.results ?? []).slice(0, 6).map((r: SearchResult) => (
            <Pressable key={r.tmdbId} style={styles.row} disabled={fix.isPending} onPress={() => fix.mutate(r.tmdbId)}>
              <Poster uri={r.posterUrl} name={r.name} width={40} />
              <Text style={styles.rowName} numberOfLines={2}>
                {r.name}
                {r.year ? <Text style={styles.meta}> {r.year}</Text> : null}
              </Text>
              <Text style={styles.pick}>This one</Text>
            </Pressable>
          ))}
          {search.data && search.data.results.length === 0 ? <Muted>No films found. Try a different spelling.</Muted> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  stepNumberText: { color: colors.ink, fontWeight: "900", fontSize: 13 },
  stepText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 21 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.panel2, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.brand },
  summary: { color: colors.text, fontSize: 15, lineHeight: 22 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
  },
  unmatched: { backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 10, gap: 10 },
  rowName: { flex: 1, color: colors.text, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, fontWeight: "500" },
  chevron: { color: colors.muted, fontSize: 22 },
  pick: { color: colors.brand, fontWeight: "700", fontSize: 13 },
});
