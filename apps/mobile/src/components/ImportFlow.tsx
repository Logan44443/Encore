import type { CatalogImport, ImportSource, ImportUnmatched, SearchResult } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { errorMessage, titleByline } from "../format";
import { colors } from "../theme";
import { RowButton } from "./PersonRow";
import { Poster } from "./Poster";
import { AuthGate, Button, Card, ErrorText, Field, H1, Loading, Muted, Screen, SectionTitle } from "./ui";

/** What differs between importing from Letterboxd (films) and Goodreads (books). */
export interface ImportConfig {
  source: ImportSource;
  site: string;
  mediaType: "movie" | "book";
  /** "film" or "book". */
  noun: string;
  /** The site's export page. Opens in its app when that handles the link, otherwise Safari. */
  exportUrl: string;
  intro: string;
  steps: string[];
  /** Document types the file picker offers. */
  fileTypes: string[];
  howScores: string;
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** The whole import: instructions and file picker, progress, then results and anything left to match. */
export function ImportScreen({ config }: { config: ImportConfig }) {
  return (
    <AuthGate>
      <ImportFlow config={config} />
    </AuthGate>
  );
}

function ImportFlow({ config }: { config: ImportConfig }) {
  const queryClient = useQueryClient();
  const key = `${config.source}-import`;
  const importer = api[config.source];
  const [startOver, setStartOver] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: [key],
    queryFn: importer.status,
    refetchInterval: (q) => (q.state.data?.import?.status === "running" ? 1500 : false),
  });
  const current = data?.import ?? null;

  // When an import finishes, everything it touched (rankings, watchlist, profile, picks) is stale.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (current?.status === "running") wasRunning.current = true;
    else if (wasRunning.current && current) {
      wasRunning.current = false;
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== key });
    }
  }, [current, queryClient, key]);

  const upload = useMutation({
    mutationFn: async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: config.fileTypes,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return null;
      const form = new FormData();
      for (const file of picked.assets) {
        // Expo's fetch rejects React Native's { uri, name, type } file parts, so read the file and hand over its
        // bytes. Expo's FormData sends any part with a bytes() method, using its name and type for the part headers.
        // The picked name is kept (not the cache copy's) because the server tells Letterboxd's CSVs apart by name.
        const onDisk = new File(file.uri);
        const part = { name: file.name, type: file.mimeType ?? "application/octet-stream", bytes: () => onDisk.bytes() };
        form.append("files", part as unknown as Blob);
      }
      return importer.start(form);
    },
    onSuccess: (res) => {
      if (!res) return;
      queryClient.setQueryData([key], res);
      setStartOver(false);
    },
    onError: (err) => Alert.alert("Couldn't import that file", errorMessage(err) ?? "Try again."),
  });

  if (isLoading) return <Loading />;
  if (current?.status === "running") return <Progress current={current} noun={config.noun} />;
  if (current && !startOver) return <Results config={config} current={current} onImportAgain={() => setStartOver(true)} />;

  return (
    <Screen>
      <H1>Import from {config.site}</H1>
      <Muted>{config.intro}</Muted>
      <ErrorText error={error} />

      <Card>
        {config.steps.map((text, i) => (
          <Step key={text} n={i + 1} text={text} />
        ))}
      </Card>

      <Button
        label={`Open ${config.site}`}
        tone="ghost"
        onPress={() => Linking.openURL(config.exportUrl).catch(() => Alert.alert(`Couldn't open ${config.site}`, config.exportUrl))}
      />
      <Button label={upload.isPending ? "Uploading…" : "Choose the export file"} disabled={upload.isPending} onPress={() => upload.mutate()} />

      <Muted>{config.howScores}</Muted>
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

function Progress({ current, noun }: { current: CatalogImport; noun: string }) {
  const share = current.total > 0 ? current.done / current.total : 0;
  return (
    <Screen>
      <H1>Importing…</H1>
      <Muted>
        Matching your {noun}s: {current.done} of {current.total}. You can leave this screen; the import keeps going.
      </Muted>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.round(share * 100)}%` }]} />
      </View>
    </Screen>
  );
}

function Results({ config, current, onImportAgain }: { config: ImportConfig; current: CatalogImport; onImportAgain: () => void }) {
  const router = useRouter();
  const { counts } = current;
  const done = config.mediaType === "book" ? "read" : "watched";
  const lines = [
    counts.ranked > 0 && `${counts.ranked} ${plural(counts.ranked, config.noun)} added to your rankings`,
    counts.alreadyRanked > 0 && `${counts.alreadyRanked} already ranked in Encore (left as they were)`,
    counts.watchlisted > 0 && `${counts.watchlisted} added to your watchlist`,
    counts.notRated > 0 && `${counts.notRated} ${done} but not rated`,
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
          <SectionTitle>{`Find these ${config.noun}s`}</SectionTitle>
          <Muted>Encore wasn't sure which {config.noun} these are. Search for each one, or skip it.</Muted>
          {current.unmatched.map((u) => (
            <UnmatchedRow key={u.key} item={u} config={config} />
          ))}
        </>
      ) : null}

      {current.notRated.length > 0 ? (
        <>
          <SectionTitle>{`${done === "read" ? "Read" : "Watched"} but not rated`}</SectionTitle>
          <Muted>These have no stars on {config.site}, so there was nothing to rank them by. Tap one to rank it.</Muted>
          {current.notRated.map((t) => (
            <Pressable key={t.tmdbId} style={styles.row} onPress={() => router.push(`/title/${config.mediaType}/${t.tmdbId}`)}>
              <Poster uri={t.posterUrl} name={t.name} width={40} />
              <Text style={styles.rowName} numberOfLines={2}>
                {t.name}
                {titleByline(t) ? <Text style={styles.meta}> {titleByline(t)}</Text> : null}
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

/** A film or book the import couldn't place: search the catalog for it, or skip it. */
function UnmatchedRow({ item, config }: { item: ImportUnmatched; config: ImportConfig }) {
  const queryClient = useQueryClient();
  const key = `${config.source}-import`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(item.author ? `${item.name} ${item.author}` : item.name);
  const search = useQuery({
    queryKey: ["catalog-search", config.mediaType, q.trim()],
    queryFn: () => api.catalog.search(config.mediaType, q.trim()),
    enabled: open && q.trim().length > 1,
  });
  const fix = useMutation({
    mutationFn: (tmdbId: number | undefined) => api[config.source].fix({ key: item.key, tmdbId }),
    onSuccess: (res, tmdbId) => {
      queryClient.setQueryData([key], res);
      if (tmdbId !== undefined) queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== key });
    },
    onError: (err) => Alert.alert("Couldn't save that", errorMessage(err) ?? "Try again."),
  });

  const detail = [
    item.author,
    item.year,
    item.kind === "watchlist" ? "Watchlist" : item.rating ? stars(item.rating) : `${config.mediaType === "book" ? "Read" : "Watched"}, no rating`,
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
                {titleByline(r) ? <Text style={styles.meta}> {titleByline(r)}</Text> : null}
              </Text>
              <Text style={styles.pick}>This one</Text>
            </Pressable>
          ))}
          {search.data && search.data.results.length === 0 ? <Muted>No {config.noun}s found. Try a different spelling.</Muted> : null}
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
