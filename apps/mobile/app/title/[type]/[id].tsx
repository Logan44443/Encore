import type { Entry, MediaType, SeasonEntry, Title } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { companionNames, draftsFrom, draftsToInput } from "@/companions";
import { CompanionPicker } from "@/components/CompanionPicker";
import { DateField } from "@/components/DateField";
import { FriendsOnTitle } from "@/components/FriendsOnTitle";
import { Poster } from "@/components/Poster";
import { EpisodeField, RankSheet, watchedAtError, type EntryDetails } from "@/components/RankSheet";
import { SeasonSheet } from "@/components/SeasonRank";
import { Button, Chip, ErrorText, H1, Loading, Muted, ScoreBadge, Screen } from "@/components/ui";
import { WhereToWatch } from "@/components/WhereToWatch";
import { formatEpisode } from "@/format";
import { colors, tierColor } from "@/theme";
import { useToggleTitle } from "@/watchlist";

export default function TitleScreen() {
  // withId / withName: opened from a friend's "watched with" tag, to log it with them.
  const { type, id, withId, withName } = useLocalSearchParams<{ type: string; id: string; withId?: string; withName?: string }>();
  const mediaType = (type === "tv" ? "tv" : "movie") as MediaType;
  const tmdbId = Number(id);
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ranking, setRanking] = useState(false);
  const [seasonMode, setSeasonMode] = useState<null | "one" | "batch" | "rerank">(null);
  const [rerankSeason, setRerankSeason] = useState<SeasonEntry | null>(null);
  const [editing, setEditing] = useState<EntryDetails | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["title", mediaType, tmdbId, user?.id],
    queryFn: () => api.catalog.title(mediaType, tmdbId),
    enabled: Number.isFinite(tmdbId),
  });
  const seasons = useQuery({
    queryKey: ["seasons", tmdbId],
    queryFn: () => api.seasons.list(tmdbId),
    enabled: mediaType === "tv" && Boolean(user) && Number.isFinite(tmdbId),
  });
  const watch = useToggleTitle(mediaType, tmdbId);
  const tagger = withId && withName ? [{ userId: withId, label: withName }] : undefined;
  const [openedForTag, setOpenedForTag] = useState(false);
  useEffect(() => {
    if (tagger && data && !data.myEntry && user && !openedForTag) {
      setOpenedForTag(true);
      setRanking(true);
    }
  }, [tagger, data, user, openedForTag]);

  const saveDetails = useMutation({
    mutationFn: (d: EntryDetails) =>
      api.entries.update(data!.myEntry!.id, {
        review: d.review.trim() || null,
        watchedAt: d.watchedAt.trim() || null,
        favoriteEpisode: d.favoriteEpisode,
        leastFavoriteEpisode: d.leastFavoriteEpisode,
        companions: draftsToInput(d.companions),
      }),
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["title", mediaType, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.entries.remove(data!.myEntry!.id),
    onSuccess: () => {
      setEditing(null);
      for (const key of ["title", "entries", "feed", "profile", "trending", "top-rated", "recommendations", "genres"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  const removeSeason = useMutation({
    mutationFn: (seasonId: string) => api.seasons.remove(seasonId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["seasons", tmdbId] }),
  });

  if (isLoading) return <Loading />;
  if (error || !data) {
    return (
      <Screen>
        <ErrorText error={error ?? new Error("Not found")} />
      </Screen>
    );
  }
  const { title, myEntry } = data;
  const startRank = () => (user ? setRanking(true) : router.push("/login"));

  return (
    <Screen>
      <Poster uri={title.posterUrl} name={title.name} width={160} />
      <Muted>{mediaType === "movie" ? "Movie" : "TV series"}</Muted>
      <H1>{title.year ? `${title.name} (${title.year})` : title.name}</H1>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {title.genres.map((g) => (
          <Chip key={g.id} label={g.name} onPress={() => router.push(`/discover?type=${mediaType}&genre=${g.id}`)} />
        ))}
      </View>
      <Muted>{title.overview}</Muted>
      <WhereToWatch mediaType={mediaType} tmdbId={tmdbId} titleName={title.name} />
      {user ? <FriendsOnTitle mediaType={mediaType} tmdbId={tmdbId} /> : null}

      {!myEntry && (
        <View style={{ gap: 8 }}>
          <Button label={mediaType === "movie" ? "Rank this movie" : "Rank this show"} onPress={startRank} />
          {mediaType === "tv" && title.seasons.length > 0 && user && (
            <Button label="Rank a season" tone="ghost" onPress={() => { setRerankSeason(null); setSeasonMode("one"); }} />
          )}
          {user && (
            <Button
              label={watch.saved ? "On your watchlist" : "Add to watchlist"}
              tone="ghost"
              disabled={watch.pending}
              onPress={watch.toggle}
            />
          )}
        </View>
      )}

      {myEntry && (
        <EntryCard
          entry={myEntry}
          editing={editing}
          onEdit={() =>
            setEditing({
              review: myEntry.review ?? "",
              watchedAt: myEntry.watchedAt ?? "",
              favoriteEpisode: myEntry.favoriteEpisode,
              leastFavoriteEpisode: myEntry.leastFavoriteEpisode,
              companions: draftsFrom(myEntry.companions),
            })
          }
          onChange={setEditing}
          title={title}
          onSave={() => editing && saveDetails.mutate(editing)}
          onCancel={() => setEditing(null)}
          onRerank={() => setRanking(true)}
          onRemove={() => Alert.alert("Remove ranking?", "This drops it from your genre list.", [{ text: "Cancel" }, { text: "Remove", style: "destructive", onPress: () => remove.mutate() }])}
          pending={saveDetails.isPending || remove.isPending}
          error={saveDetails.error}
          onOpenGenre={() => router.push("/lists")}
        />
      )}

      {mediaType === "tv" && user && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>Seasons</Text>
          <Muted>Ranked against each other, the same way titles compete inside a genre.</Muted>
          {(seasons.data?.seasons ?? []).map((s, i) => (
            <Pressable
              key={s.id}
              onPress={() => {
                setRerankSeason(s);
                setSeasonMode("rerank");
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12 }}
            >
              <Text style={{ color: colors.muted, width: 22, fontWeight: "800" }}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{s.seasonNumber === 0 ? s.name : `Season ${s.seasonNumber}`}</Text>
                <Muted>{s.name !== `Season ${s.seasonNumber}` ? s.name : `${s.episodeCount} episodes`}</Muted>
              </View>
              <ScoreBadge score={s.score} color={tierColor[s.tier]} />
              <Pressable
                hitSlop={8}
                onPress={() =>
                  Alert.alert(`Remove your ${s.seasonNumber === 0 ? s.name : `Season ${s.seasonNumber}`} ranking?`, undefined, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => removeSeason.mutate(s.id) },
                  ])
                }
              >
                <Text style={{ color: colors.disliked, fontWeight: "700" }}>✕</Text>
              </Pressable>
            </Pressable>
          ))}
          <ErrorText error={removeSeason.error} />
          {title.seasons.length > 0 && (
            <Button label={seasons.data?.seasons.length ? "Rank another season" : "Rank a season"} tone="ghost" onPress={() => { setRerankSeason(null); setSeasonMode("one"); }} />
          )}
          {myEntry && title.seasons.length > 0 && (
            <Button label="Rank every season you watched" tone="ghost" onPress={() => { setRerankSeason(null); setSeasonMode("batch"); }} />
          )}
        </View>
      )}

      {ranking && <RankSheet title={title} existing={myEntry} initialCompanions={myEntry ? undefined : tagger} onClose={() => setRanking(false)} />}
      {seasonMode && (
        <SeasonSheet
          title={title}
          mode={seasonMode === "rerank" ? "rerank" : seasonMode === "batch" ? "batch" : "one"}
          existing={rerankSeason}
          onClose={() => setSeasonMode(null)}
        />
      )}
    </Screen>
  );
}

function EntryCard({
  title,
  entry,
  editing,
  onEdit,
  onChange,
  onSave,
  onCancel,
  onRerank,
  onRemove,
  pending,
  error,
  onOpenGenre,
}: {
  title: Title;
  entry: Entry;
  editing: EntryDetails | null;
  onEdit: () => void;
  onChange: (d: EntryDetails | null) => void;
  onSave: () => void;
  onCancel: () => void;
  onRerank: () => void;
  onRemove: () => void;
  pending: boolean;
  error: unknown;
  onOpenGenre: () => void;
}) {
  return (
    <View style={{ gap: 10, backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <ScoreBadge score={entry.score} color={tierColor[entry.tier]} size={64} />
        <View style={{ flex: 1 }}>
          <Muted>Your score in {entry.genreName}</Muted>
          {entry.watchedAt ? <Muted>Watched {entry.watchedAt}</Muted> : null}
          <Pressable onPress={onOpenGenre}>
            <Text style={{ color: colors.brand, fontWeight: "700" }}>See your {entry.genreName} ranking</Text>
          </Pressable>
        </View>
      </View>
      {editing ? (
        <View style={{ gap: 8 }}>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.text, padding: 12, minHeight: 80 }}
            multiline
            value={editing.review}
            onChangeText={(review) => onChange({ ...editing, review })}
            placeholder="Your thoughts"
            placeholderTextColor={colors.muted}
          />
          <DateField label="Watched on" value={editing.watchedAt} onChange={(watchedAt) => onChange({ ...editing, watchedAt })} noFuture />
          <CompanionPicker value={editing.companions} onChange={(companions) => onChange({ ...editing, companions })} />
          {title.mediaType === "tv" && title.seasons.length > 0 && (
            <>
              <EpisodeField label="Favorite episode" tmdbId={title.tmdbId} seasons={title.seasons} value={editing.favoriteEpisode} onChange={(favoriteEpisode) => onChange({ ...editing, favoriteEpisode })} />
              <EpisodeField label="Least favorite episode" tmdbId={title.tmdbId} seasons={title.seasons} value={editing.leastFavoriteEpisode} onChange={(leastFavoriteEpisode) => onChange({ ...editing, leastFavoriteEpisode })} />
            </>
          )}
          {watchedAtError(editing.watchedAt) ? <ErrorText error={new Error(watchedAtError(editing.watchedAt)!)} /> : null}
          <ErrorText error={error} />
          <Button label="Save" disabled={pending || Boolean(watchedAtError(editing.watchedAt))} onPress={onSave} />
          <Button label="Cancel" tone="ghost" onPress={onCancel} />
          <Button label="Remove" tone="danger" onPress={onRemove} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {entry.review ? <Muted>“{entry.review}”</Muted> : null}
          {companionNames(entry.companions) ? <Muted>Watched with {companionNames(entry.companions)}</Muted> : null}
          {entry.favoriteEpisode ? <Text style={{ color: colors.liked }}>Favorite: {formatEpisode(entry.favoriteEpisode)}</Text> : null}
          {entry.leastFavoriteEpisode ? <Text style={{ color: colors.disliked }}>Least favorite: {formatEpisode(entry.leastFavoriteEpisode)}</Text> : null}
          <Button label="Re-rank" tone="ghost" onPress={onRerank} />
          <Button label="Edit" tone="ghost" onPress={onEdit} />
        </View>
      )}
    </View>
  );
}
