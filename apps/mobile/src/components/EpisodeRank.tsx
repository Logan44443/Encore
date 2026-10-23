import {
  TIER_LABELS,
  TIERS,
  answerComparison,
  insertionIndex,
  maxComparisons,
  nextComparisonIndex,
  startComparison,
  type ComparisonAnswer,
  type ComparisonState,
  type Episode,
  type EpisodeEntry,
  type Tier,
} from "@encore/shared";
import { Image } from "expo-image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { colors, tierColor } from "../theme";
import { episodeCode, invalidateTv } from "../tv";
import { Button, ErrorText, Loading, Muted, ScoreBadge } from "./ui";

/** An episode to rank: from the catalog when new, or an existing ranking to move. */
type QueueItem = { seasonNumber: number; episodeNumber: number; name: string; stillUrl: string | null; existing: EpisodeEntry | null };

export function queueFrom(episodes: Episode[], ranked: EpisodeEntry[]): QueueItem[] {
  return episodes.map((e) => ({
    seasonNumber: e.season,
    episodeNumber: e.episode,
    name: e.name || `Episode ${e.episode}`,
    stillUrl: e.stillUrl,
    existing: ranked.find((r) => r.seasonNumber === e.season && r.episodeNumber === e.episode) ?? null,
  }));
}

/**
 * Ranks episodes of one show against its other ranked episodes (from any
 * season) with the same head-to-head questions used for titles and seasons.
 * Walks the queue one episode at a time; an item with `existing` is re-ranked.
 */
export function EpisodeRank({ tmdbId, queue, onFinished }: { tmdbId: number; queue: QueueItem[]; onFinished: () => void }) {
  const [cursor, setCursor] = useState(0);
  const [tier, setTier] = useState<Tier | null>(null);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const saving = useRef(false);
  const queryClient = useQueryClient();
  const current = queue[cursor];

  const candidatesQuery = useQuery({
    queryKey: ["episode-candidates", tmdbId, tier, current?.existing?.id, cursor, savedCount],
    queryFn: () => api.episodes.candidates({ tmdbId, tier: tier!, excludeEntryId: current?.existing?.id }),
    enabled: current !== undefined && tier !== null,
    staleTime: 0,
    gcTime: 0,
  });
  const candidates = candidatesQuery.data?.candidates ?? [];

  const save = useMutation({
    mutationFn: async (aboveEntryId: string | null) => {
      if (!current || !tier) throw new Error("Pick a reaction first");
      if (current.existing) return api.episodes.rerank(current.existing.id, { tier, aboveEntryId });
      return api.episodes.create({ tmdbId, seasonNumber: current.seasonNumber, episodeNumber: current.episodeNumber, tier, aboveEntryId });
    },
    onSuccess: () => {
      saving.current = false;
      setSavedCount((n) => n + 1);
      invalidateTv(queryClient, tmdbId);
      const next = cursor + 1;
      if (next < queue.length) {
        setCursor(next);
        setTier(null);
        setCmp(null);
      } else {
        onFinished();
      }
    },
    onError: () => {
      saving.current = false;
    },
  });

  useEffect(() => {
    if (!current || tier === null || !candidatesQuery.data || cmp || save.isPending) return;
    const list = candidatesQuery.data.candidates;
    if (list.length === 0) {
      if (saving.current) return;
      saving.current = true;
      setCmp(startComparison(0));
      save.mutate(null);
      return;
    }
    setCmp(startComparison(list.length));
  }, [current, tier, candidatesQuery.data, cmp, save]);

  const answer = (a: ComparisonAnswer) => {
    if (!cmp || saving.current) return;
    const next = answerComparison(cmp, a);
    setCmp(next);
    if (nextComparisonIndex(next) === null) {
      const index = insertionIndex(next);
      saving.current = true;
      save.mutate(index === 0 ? null : candidates[index - 1].entryId);
    }
  };

  if (!current) return null;
  const code = episodeCode(current.seasonNumber, current.episodeNumber);
  const opponentIdx = cmp ? nextComparisonIndex(cmp) : null;
  const opponent = opponentIdx !== null ? candidates[opponentIdx] : null;

  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.kicker}>
        {queue.length > 1 ? `Episode ${cursor + 1} of ${queue.length}` : "Episode ranking"} · {code}
      </Text>
      {tier === null && (
        <>
          {current.stillUrl ? <Image source={{ uri: current.stillUrl }} style={styles.still} contentFit="cover" /> : null}
          <Text style={styles.h2}>How was “{current.name}”?</Text>
          <Muted>Your gut reaction. We'll place it against the other episodes of this show you've ranked next.</Muted>
          {TIERS.map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                saving.current = false;
                setCmp(null);
                setTier(t);
              }}
              style={[styles.tier, { borderColor: tierColor[t] }]}
            >
              <Text style={{ color: tierColor[t], fontWeight: "700" }}>{TIER_LABELS[t]}</Text>
            </Pressable>
          ))}
          {queue.length > 1 && (
            <Button
              label="Skip this episode"
              tone="ghost"
              onPress={() => (cursor + 1 < queue.length ? setCursor(cursor + 1) : onFinished())}
            />
          )}
        </>
      )}
      {tier !== null && !opponent && (candidatesQuery.isLoading || save.isPending) && <Loading />}
      <ErrorText error={candidatesQuery.error ?? save.error} />
      {save.isError && (
        <Button
          label="Try again"
          tone="ghost"
          onPress={() => {
            saving.current = false;
            setCmp(null);
            save.reset();
          }}
        />
      )}
      {opponent && cmp && (
        <>
          <Text style={styles.h2}>Which episode did you like more?</Text>
          <Muted>
            Question {cmp.asked + 1} of at most {maxComparisons(candidates.length)}
          </Muted>
          <View style={styles.compare}>
            <Pressable style={[styles.compareCard, styles.compareNew]} onPress={() => answer("new")}>
              <Text style={styles.compareKicker}>This episode</Text>
              <Text style={styles.compareName}>{current.name}</Text>
              <Text style={styles.meta}>{code}</Text>
            </Pressable>
            <Pressable style={styles.compareCard} onPress={() => answer("existing")}>
              <Text style={styles.compareKicker}>Already ranked</Text>
              <Text style={styles.compareName}>{opponent.name}</Text>
              <Text style={styles.meta}>{episodeCode(opponent.seasonNumber, opponent.episodeNumber)}</Text>
              <ScoreBadge score={opponent.score} />
            </Pressable>
          </View>
          <Button label="Too close to call" tone="ghost" onPress={() => answer("tie")} />
        </>
      )}
    </View>
  );
}

export function EpisodeSheet({
  tmdbId,
  showName,
  queue,
  onClose,
}: {
  tmdbId: number;
  showName: string;
  queue: QueueItem[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.ink }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: 32, gap: 12 }}>
        <View style={styles.top}>
          <Text style={styles.kicker}>{showName}</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.brand, fontWeight: "700" }}>Close</Text>
          </Pressable>
        </View>
        <EpisodeRank tmdbId={tmdbId} queue={queue} onFinished={onClose} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h2: { color: colors.text, fontSize: 22, fontWeight: "800" },
  kicker: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  still: { width: "100%", aspectRatio: 16 / 9, borderRadius: 14, backgroundColor: colors.panel2 },
  tier: { borderWidth: 1, borderRadius: 14, padding: 16, backgroundColor: colors.panel2 },
  compare: { flexDirection: "row", gap: 10 },
  compareCard: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, borderRadius: 16, padding: 12, gap: 8, minHeight: 140 },
  compareNew: { borderColor: "rgba(245,158,11,0.45)" },
  compareKicker: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  compareName: { color: colors.text, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.muted, fontSize: 12 },
});
