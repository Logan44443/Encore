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
  type SeasonEntry,
  type SeasonSummary,
  type Tier,
  type Title,
} from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { colors, tierColor } from "../theme";
import { Button, Chip, ErrorText, Loading, Muted, ScoreBadge } from "./ui";

type Mode = "batch" | "one" | "rerank";

/**
 * Ranks seasons of one show against each other with the same head-to-head
 * questions used for genre lists. `batch` walks every selected season;
 * `one` ranks a single season; `rerank` moves an existing season.
 */
export function SeasonRank({
  title,
  mode,
  existing,
  onFinished,
  onSkip,
}: {
  title: Title;
  mode: Mode;
  existing?: SeasonEntry | null;
  onFinished: () => void;
  onSkip?: () => void;
}) {
  const seasons = title.seasons;
  const numbered = seasons.filter((s) => s.seasonNumber > 0);
  const [selected, setSelected] = useState<number[]>(() =>
    existing ? [existing.seasonNumber] : mode === "one" ? [] : numbered.map((s) => s.seasonNumber),
  );
  const [queue, setQueue] = useState<number[] | null>(mode === "rerank" && existing ? [existing.seasonNumber] : null);
  const [cursor, setCursor] = useState(0);
  const [tier, setTier] = useState<Tier | null>(null);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const saving = useRef(false);
  const queryClient = useQueryClient();

  const ranked = useQuery({
    queryKey: ["seasons", title.tmdbId],
    queryFn: () => api.seasons.list(title.tmdbId),
  });

  useEffect(() => {
    if (mode !== "batch" || !ranked.data) return;
    const taken = new Set(ranked.data.seasons.map((s) => s.seasonNumber));
    setSelected((prev) => prev.filter((n) => !taken.has(n)));
  }, [mode, ranked.data]);
  const already = new Set((ranked.data?.seasons ?? []).map((s) => s.seasonNumber));
  const currentNumber = queue?.[cursor];
  const currentMeta = seasons.find((s) => s.seasonNumber === currentNumber);
  const existingForCurrent =
    existing && existing.seasonNumber === currentNumber
      ? existing
      : (ranked.data?.seasons ?? []).find((s) => s.seasonNumber === currentNumber);

  const candidatesQuery = useQuery({
    queryKey: ["season-candidates", title.tmdbId, tier, existingForCurrent?.id, cursor, savedCount],
    queryFn: () =>
      api.seasons.candidates({
        tmdbId: title.tmdbId,
        tier: tier!,
        excludeEntryId: existingForCurrent?.id,
      }),
    enabled: currentNumber !== undefined && tier !== null,
    staleTime: 0,
    gcTime: 0,
  });
  const candidates = candidatesQuery.data?.candidates ?? [];

  const save = useMutation({
    mutationFn: async (aboveEntryId: string | null) => {
      if (currentNumber === undefined || !tier) throw new Error("Pick a reaction first");
      if (existingForCurrent && (mode === "rerank" || already.has(currentNumber))) {
        return api.seasons.rerank(existingForCurrent.id, { tier, aboveEntryId });
      }
      return api.seasons.create({ tmdbId: title.tmdbId, seasonNumber: currentNumber, tier, aboveEntryId });
    },
    onSuccess: async () => {
      saving.current = false;
      setSavedCount((n) => n + 1);
      await queryClient.invalidateQueries({ queryKey: ["seasons", title.tmdbId] });
      const next = cursor + 1;
      if (queue && next < queue.length) {
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
    if (currentNumber === undefined || tier === null || !candidatesQuery.data || cmp || save.isPending) return;
    const list = candidatesQuery.data.candidates;
    if (list.length === 0) {
      if (saving.current) return;
      saving.current = true;
      setCmp(startComparison(0));
      save.mutate(null);
      return;
    }
    setCmp(startComparison(list.length));
  }, [currentNumber, tier, candidatesQuery.data, cmp, save]);

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

  const startQueue = (numbers: number[]) => {
    const fresh = mode === "batch" ? numbers.filter((n) => !already.has(n)) : numbers;
    if (fresh.length === 0) {
      onFinished();
      return;
    }
    setQueue(fresh);
    setCursor(0);
    setTier(null);
    setCmp(null);
  };

  if (ranked.isLoading) return <Loading />;

  if (!queue) {
    return (
      <View style={{ gap: 14 }}>
        <Text style={styles.h2}>{mode === "one" ? "Which season?" : "Which seasons did you watch?"}</Text>
        <Muted>
          {mode === "one"
            ? "It will be compared with the other seasons of this show you've already ranked."
            : "Each season is ranked against the others, the same way a title is ranked inside a genre."}
        </Muted>
        <View style={styles.wrap}>
          {seasons.map((s) => (
            <SeasonChip
              key={s.seasonNumber}
              season={s}
              active={selected.includes(s.seasonNumber)}
              locked={mode !== "one" && already.has(s.seasonNumber)}
              onPress={() => {
                if (mode === "one") setSelected([s.seasonNumber]);
                else if (!already.has(s.seasonNumber)) {
                  setSelected((prev) =>
                    prev.includes(s.seasonNumber) ? prev.filter((n) => n !== s.seasonNumber) : [...prev, s.seasonNumber],
                  );
                }
              }}
            />
          ))}
        </View>
        {mode !== "one" && already.size > 0 && <Muted>Seasons you've already ranked stay put. Re-rank them from the show page.</Muted>}
        <Button
          label={mode === "one" ? "Rank this season" : "Rank these seasons"}
          disabled={selected.length === 0 || (mode === "one" && selected.length !== 1)}
          onPress={() => startQueue([...selected].sort((a, b) => a - b))}
        />
        {onSkip && <Button label="Skip seasons" tone="ghost" onPress={onSkip} />}
      </View>
    );
  }

  const label = currentMeta ? seasonLabel(currentMeta) : `Season ${currentNumber}`;
  const opponentIdx = cmp ? nextComparisonIndex(cmp) : null;
  const opponent = opponentIdx !== null ? candidates[opponentIdx] : null;

  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.kicker}>
        {queue.length > 1 ? `Season ${cursor + 1} of ${queue.length}` : "Season ranking"} · {label}
      </Text>
      {tier === null && (
        <>
          <Text style={styles.h2}>How was {label}?</Text>
          <Muted>Your gut reaction — we'll place it against the other seasons next.</Muted>
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
          <Text style={styles.h2}>Which season did you like more?</Text>
          <Muted>
            Question {cmp.asked + 1} of at most {maxComparisons(candidates.length)}
          </Muted>
          <View style={styles.compare}>
            <Pressable style={[styles.compareCard, styles.compareNew]} onPress={() => answer("new")}>
              <Text style={styles.compareKicker}>This season</Text>
              <Text style={styles.compareName}>{label}</Text>
              {currentMeta ? <Text style={styles.meta}>{currentMeta.episodeCount} episodes</Text> : null}
            </Pressable>
            <Pressable style={styles.compareCard} onPress={() => answer("existing")}>
              <Text style={styles.compareKicker}>Already ranked</Text>
              <Text style={styles.compareName}>{seasonTitle(opponent.seasonNumber, opponent.name)}</Text>
              <ScoreBadge score={opponent.score} color={tier ? tierColor[tier] : colors.brand} />
            </Pressable>
          </View>
          <Button label="Too close to call" tone="ghost" onPress={() => answer("tie")} />
        </>
      )}
    </View>
  );
}

function SeasonChip({
  season,
  active,
  locked,
  onPress,
}: {
  season: SeasonSummary;
  active: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Chip
      label={`${seasonLabel(season)}${locked ? " · ranked" : ""}`}
      active={active && !locked}
      onPress={locked ? () => undefined : onPress}
    />
  );
}

export function SeasonSheet({
  title,
  mode,
  existing,
  onClose,
}: {
  title: Title;
  mode: Mode;
  existing?: SeasonEntry | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.ink }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: 32, gap: 12 }}>
        <View style={styles.top}>
          <Text style={styles.kicker}>{title.name}</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.brand, fontWeight: "700" }}>Close</Text>
          </Pressable>
        </View>
        <SeasonRank title={title} mode={mode} existing={existing} onFinished={onClose} onSkip={mode === "batch" ? onClose : undefined} />
      </ScrollView>
    </Modal>
  );
}

function seasonLabel(season: SeasonSummary) {
  if (season.seasonNumber === 0) return season.name || "Specials";
  return season.name && !/^season\s+\d+$/i.test(season.name) ? `S${season.seasonNumber} · ${season.name}` : `Season ${season.seasonNumber}`;
}

function seasonTitle(n: number, name: string) {
  if (/^season\s+\d+$/i.test(name) || name === "Specials") return n === 0 ? "Specials" : `Season ${n}`;
  return `S${n} · ${name}`;
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h2: { color: colors.text, fontSize: 22, fontWeight: "800" },
  kicker: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tier: { borderWidth: 1, borderRadius: 14, padding: 16, backgroundColor: colors.panel2 },
  compare: { flexDirection: "row", gap: 10 },
  compareCard: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, borderRadius: 16, padding: 12, gap: 8, minHeight: 140 },
  compareNew: { borderColor: "rgba(245,158,11,0.45)" },
  compareKicker: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  compareName: { color: colors.text, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.muted, fontSize: 12 },
});
