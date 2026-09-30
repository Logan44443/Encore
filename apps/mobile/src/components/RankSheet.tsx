import {
  TIER_LABELS,
  TIERS,
  answerComparison,
  genreName,
  genresFor,
  insertionIndex,
  isValidIsoDate,
  maxComparisons,
  nextComparisonIndex,
  startComparison,
  type ComparisonAnswer,
  type ComparisonState,
  type Entry,
  type EntryResult,
  type Episode,
  type EpisodeRef,
  type Tier,
  type Title,
} from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { formatEpisode, localToday } from "../format";
import { colors, tierColor } from "../theme";
import { Poster } from "./Poster";
import { SeasonRank } from "./SeasonRank";
import { Button, Chip, ErrorText, Loading, Muted, ScoreBadge } from "./ui";

type Step = "genre" | "tier" | "compare" | "details" | "seasons" | "done";

export interface EntryDetails {
  review: string;
  watchedAt: string;
  favoriteEpisode: EpisodeRef | null;
  leastFavoriteEpisode: EpisodeRef | null;
}

function emptyDetails(): EntryDetails {
  return { review: "", watchedAt: localToday(), favoriteEpisode: null, leastFavoriteEpisode: null };
}

/** Message for a bad "watched on" date, or null when it's blank or valid. */
export function watchedAtError(value: string): string | null {
  const v = value.trim();
  return v && !isValidIsoDate(v) ? "Use a real date as YYYY-MM-DD, or leave it blank" : null;
}

export function RankSheet({
  title,
  existing,
  onClose,
}: {
  title: Title;
  existing?: Entry | null;
  onClose: () => void;
}) {
  // Only genres the API ranks in; a catalog genre outside the list would be rejected on save.
  const known = title.genres.filter((g) => genresFor(title.mediaType).some((k) => k.id === g.id));
  const genreOptions = known.length > 0 ? known : genresFor(title.mediaType);
  const [step, setStep] = useState<Step>(genreOptions.length === 1 && !existing ? "tier" : "genre");
  const [genreId, setGenreId] = useState(existing?.genreId ?? genreOptions[0].id);
  const [tier, setTier] = useState<Tier | null>(null);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [details, setDetails] = useState<EntryDetails>(emptyDetails);
  const [result, setResult] = useState<EntryResult | null>(null);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const candidatesQuery = useQuery({
    queryKey: ["candidates", title.mediaType, genreId, tier, existing?.id],
    queryFn: () => api.entries.candidates({ mediaType: title.mediaType, genreId, tier: tier!, excludeEntryId: existing?.id }),
    enabled: step === "compare" && tier !== null,
    staleTime: 0,
    gcTime: 0,
  });
  const candidates = candidatesQuery.data?.candidates ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["entries"] });
    queryClient.invalidateQueries({ queryKey: ["title", title.mediaType, title.tmdbId] });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["trending"] });
    queryClient.invalidateQueries({ queryKey: ["top-rated"] });
    queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    queryClient.invalidateQueries({ queryKey: ["genres"] });
    queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  const save = useMutation({
    mutationFn: async (state: ComparisonState | null) => {
      const index = state ? insertionIndex(state) : 0;
      const aboveEntryId = index === 0 ? null : candidates[index - 1].entryId;
      if (existing) return api.entries.rerank(existing.id, { genreId, tier: tier!, aboveEntryId });
      return api.entries.create({
        mediaType: title.mediaType,
        tmdbId: title.tmdbId,
        genreId,
        tier: tier!,
        aboveEntryId,
        review: details.review.trim() || null,
        watchedAt: details.watchedAt.trim() || null,
        favoriteEpisode: details.favoriteEpisode,
        leastFavoriteEpisode: details.leastFavoriteEpisode,
      });
    },
    onSuccess: (res) => {
      setResult(res);
      invalidate();
      if (!existing && title.mediaType === "tv" && title.seasons.length > 0) setStep("seasons");
      else setStep("done");
    },
  });

  useEffect(() => {
    if (step !== "compare" || !candidatesQuery.data || cmp) return;
    const list = candidatesQuery.data.candidates;
    if (list.length === 0) {
      const empty = startComparison(0);
      setCmp(empty);
      if (existing) save.mutate(empty);
      else setStep("details");
    } else {
      setCmp(startComparison(list.length));
    }
    // save.mutate is stable enough; including `save` retriggers this after success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, candidatesQuery.data, cmp, existing]);

  const answer = (a: ComparisonAnswer) => {
    if (!cmp) return;
    const next = answerComparison(cmp, a);
    setCmp(next);
    if (nextComparisonIndex(next) === null) {
      if (existing) save.mutate(next);
      else setStep("details");
    }
  };

  const opponentIdx = cmp ? nextComparisonIndex(cmp) : null;
  const opponent = opponentIdx !== null ? candidates[opponentIdx] : null;
  const genre = genreName(title.mediaType, genreId);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.ink }}
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.top}>
          <Text style={styles.kicker}>{existing ? "Re-rank" : "Rank"} · {title.name}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        {step === "genre" && (
          <View style={{ gap: 12 }}>
            <Text style={styles.h2}>Which genre should it compete in?</Text>
            <Muted>It'll only be compared against your other {genre.toLowerCase()} picks.</Muted>
            <View style={styles.wrap}>
              {genreOptions.map((g) => (
                <Chip key={g.id} label={g.name} active={g.id === genreId} onPress={() => setGenreId(g.id)} />
              ))}
            </View>
            <Button label="Continue" onPress={() => setStep("tier")} />
          </View>
        )}

        {step === "tier" && (
          <View style={{ gap: 12 }}>
            <Text style={styles.h2}>How was it?</Text>
            <Muted>Your gut reaction — we'll fine-tune it next.</Muted>
            {TIERS.map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  setTier(t);
                  setCmp(null);
                  setStep("compare");
                }}
                style={[styles.tier, { borderColor: tierColor[t] }]}
              >
                <Text style={{ color: tierColor[t], fontWeight: "700" }}>{TIER_LABELS[t]}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === "compare" && (
          <View style={{ gap: 12 }}>
            <Text style={styles.h2}>Which did you like more?</Text>
            <Muted>
              {cmp && candidates.length > 0
                ? `Question ${cmp.asked + 1} of at most ${maxComparisons(candidates.length)} · ${genre}`
                : "Loading your list…"}
            </Muted>
            <ErrorText error={candidatesQuery.error ?? save.error} />
            {candidatesQuery.isLoading && <Loading />}
            {opponent && (
              <>
                <View style={styles.compare}>
                  <CompareCard name={title.name} year={title.year} posterUrl={title.posterUrl} highlight onPress={() => answer("new")} />
                  <CompareCard name={opponent.title.name} year={opponent.title.year} posterUrl={opponent.title.posterUrl} onPress={() => answer("existing")} />
                </View>
                <Button label="Too close to call" tone="ghost" onPress={() => answer("tie")} />
              </>
            )}
          </View>
        )}

        {step === "details" && (
          <View style={{ gap: 12 }}>
            <Text style={styles.h2}>Anything to add?</Text>
            <Muted>Optional — you can edit this later.</Muted>
            <Text style={styles.label}>Your thoughts</Text>
            <TextInput
              style={[styles.input, { minHeight: 100 }]}
              multiline
              placeholder="What stood out?"
              placeholderTextColor={colors.muted}
              value={details.review}
              onChangeText={(review) => setDetails({ ...details, review })}
            />
            <Text style={styles.label}>Watched on</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.muted}
              value={details.watchedAt}
              onChangeText={(watchedAt) => setDetails({ ...details, watchedAt })}
              autoCapitalize="none"
            />
            {title.mediaType === "tv" && title.seasons.length > 0 && (
              <>
                <EpisodeField
                  label="Favorite episode"
                  tmdbId={title.tmdbId}
                  seasons={title.seasons}
                  value={details.favoriteEpisode}
                  onChange={(favoriteEpisode) => setDetails({ ...details, favoriteEpisode })}
                />
                <EpisodeField
                  label="Least favorite episode"
                  tmdbId={title.tmdbId}
                  seasons={title.seasons}
                  value={details.leastFavoriteEpisode}
                  onChange={(leastFavoriteEpisode) => setDetails({ ...details, leastFavoriteEpisode })}
                />
              </>
            )}
            {watchedAtError(details.watchedAt) ? <ErrorText error={new Error(watchedAtError(details.watchedAt)!)} /> : null}
            <ErrorText error={save.error} />
            <Button
              label={save.isPending ? "Saving…" : "Save ranking"}
              disabled={save.isPending || Boolean(watchedAtError(details.watchedAt))}
              onPress={() => save.mutate(cmp)}
            />
          </View>
        )}

        {step === "seasons" && (
          <SeasonRank title={title} mode="batch" onFinished={() => setStep("done")} onSkip={() => setStep("done")} />
        )}

        {step === "done" && (
          <View style={{ alignItems: "center", gap: 12, paddingTop: 24 }}>
            {result ? (
              <>
                <ScoreBadge score={result.entry.score} color={tierColor[result.entry.tier]} size={80} />
                <Text style={styles.h2}>
                  #{result.rank} of {result.outOf} in {result.entry.genreName}
                </Text>
                <Muted>
                  {title.name} scored {result.entry.score.toFixed(1)} / 10
                </Muted>
                <Button label="Done" onPress={onClose} />
              </>
            ) : (
              <>
                <ErrorText error={save.error} />
                {save.isPending ? <Muted>Saving…</Muted> : null}
                {save.isError && (
                  <Button
                    label="Start over"
                    tone="ghost"
                    onPress={() => {
                      setCmp(null);
                      setStep("tier");
                      save.reset();
                    }}
                  />
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

function CompareCard({
  name,
  year,
  posterUrl,
  onPress,
  highlight,
}: {
  name: string;
  year: number | null;
  posterUrl: string | null;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.compareCard, highlight && { borderColor: "rgba(245,158,11,0.45)" }]}>
      <Poster uri={posterUrl} name={name} width={120} />
      <Text style={styles.compareName} numberOfLines={2}>
        {name}
      </Text>
      {year ? <Text style={styles.meta}>{year}</Text> : null}
    </Pressable>
  );
}

export function EpisodeField({
  label,
  tmdbId,
  seasons,
  value,
  onChange,
}: {
  label: string;
  tmdbId: number;
  seasons: Title["seasons"];
  value: EpisodeRef | null;
  onChange: (v: EpisodeRef | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [season, setSeason] = useState<number | null>(value?.season ?? null);
  const episodes = useQuery({
    queryKey: ["episodes", tmdbId, season],
    queryFn: () => api.catalog.season(tmdbId, season!),
    enabled: open && season !== null,
  });

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={styles.input}>
        <Text style={{ color: value ? colors.text : colors.muted }}>{value ? formatEpisode(value) : "Choose an episode"}</Text>
      </Pressable>
      {value && (
        <Pressable onPress={() => onChange(null)}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Clear</Text>
        </Pressable>
      )}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.ink }} contentContainerStyle={{ padding: 20, gap: 10 }}>
          <View style={styles.top}>
            <Text style={styles.h2}>{season === null ? label : `Season ${season}`}</Text>
            <Pressable onPress={() => (season === null ? setOpen(false) : setSeason(null))}>
              <Text style={styles.close}>{season === null ? "Close" : "Back"}</Text>
            </Pressable>
          </View>
          {season === null ? (
            seasons.map((s) => (
              <Pressable key={s.seasonNumber} onPress={() => setSeason(s.seasonNumber)} style={styles.tier}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {s.seasonNumber === 0 ? s.name : `Season ${s.seasonNumber}`}
                </Text>
                <Text style={styles.meta}>{s.episodeCount} episodes</Text>
              </Pressable>
            ))
          ) : episodes.isLoading ? (
            <Loading />
          ) : (
            (episodes.data?.episodes ?? []).map((ep: Episode) => (
              <Pressable
                key={`${ep.season}-${ep.episode}`}
                onPress={() => {
                  onChange({ season: ep.season, episode: ep.episode, name: ep.name });
                  setOpen(false);
                }}
                style={styles.tier}
              >
                <Text style={{ color: colors.text }}>
                  E{ep.episode} · {ep.name}
                </Text>
              </Pressable>
            ))
          )}
          <ErrorText error={episodes.error} />
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  kicker: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", flex: 1 },
  close: { color: colors.brand, fontWeight: "700" },
  h2: { color: colors.text, fontSize: 22, fontWeight: "800" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tier: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, backgroundColor: colors.panel2, gap: 4 },
  compare: { flexDirection: "row", gap: 10 },
  compareCard: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, borderRadius: 16, padding: 8, gap: 6 },
  compareName: { color: colors.text, fontWeight: "700", fontSize: 13 },
  meta: { color: colors.muted, fontSize: 12 },
  label: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
});
