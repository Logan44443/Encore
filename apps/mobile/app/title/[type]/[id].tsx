import { MEDIA_TYPE_LABELS, type Entry, type Title } from "@encore/shared";
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
import { sourceNote } from "@/components/TvRows";
import { Button, Chip, ErrorText, H1, Loading, Muted, ScoreBadge, Screen } from "@/components/ui";
import { WhereToWatch } from "@/components/WhereToWatch";
import { doneVerb, formatEpisode, parseMediaType } from "@/format";
import { colors } from "@/theme";
import { invalidateTv, seasonName } from "@/tv";
import { useToggleTitle } from "@/watchlist";

const RANK_LABEL = { movie: "Rank this movie", tv: "Rank this show", book: "Rank this book" } as const;

export default function TitleScreen() {
  // withId / withName: opened from a friend's "watched with" tag, to log it with them.
  const { type, id, withId, withName } = useLocalSearchParams<{ type: string; id: string; withId?: string; withName?: string }>();
  const mediaType = parseMediaType(type);
  const tmdbId = Number(id);
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ranking, setRanking] = useState(false);
  const [seasonMode, setSeasonMode] = useState<null | "one" | "batch">(null);
  const [editing, setEditing] = useState<EntryDetails | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["title", mediaType, tmdbId, user?.id],
    queryFn: () => api.catalog.title(mediaType, tmdbId),
    enabled: Number.isFinite(tmdbId),
  });
  const tv = useQuery({
    queryKey: ["tv", tmdbId],
    queryFn: () => api.tv(tmdbId),
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
      invalidateTv(queryClient, tmdbId);
    },
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
  const showScore = tv.data?.shows[0] ?? null;
  const seasonScores = new Map((tv.data?.seasons ?? []).map((s) => [s.seasonNumber, s]));
  const startRank = () => (user ? setRanking(true) : router.push("/login"));

  return (
    <Screen>
      <Poster uri={title.posterUrl} name={title.name} width={160} />
      <Muted>{MEDIA_TYPE_LABELS[mediaType]}</Muted>
      <H1>{title.year ? `${title.name} (${title.year})` : title.name}</H1>
      {title.author ? <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>by {title.author}</Text> : null}
      {/* Your score comes first when you've ranked it (or its seasons). */}
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
          seasonAverage={showScore?.seasonAverage ?? null}
          onSave={() => editing && saveDetails.mutate(editing)}
          onCancel={() => setEditing(null)}
          onRerank={() => setRanking(true)}
          onRemove={() => Alert.alert("Remove ranking?", "This drops it from your genre list.", [{ text: "Cancel" }, { text: "Remove", style: "destructive", onPress: () => remove.mutate() }])}
          pending={saveDetails.isPending || remove.isPending}
          error={saveDetails.error}
          onOpenGenre={() => router.push("/lists")}
        />
      )}
      {!myEntry && showScore && (
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14 }}>
          <ScoreBadge score={showScore.score} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Your score · {sourceNote(showScore.rankedSeasons, "season")}</Text>
            <Muted>Rank the show itself to set your own score and place it in your {showScore.genreName} list.</Muted>
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {title.genres.map((g) => (
          <Chip key={g.id} label={g.name} onPress={() => router.push(`/discover?type=${mediaType}&genre=${g.id}`)} />
        ))}
      </View>
      {title.pageCount ? <Muted>{title.pageCount} pages</Muted> : null}
      <Muted>{title.overview}</Muted>
      {mediaType !== "book" && <WhereToWatch mediaType={mediaType} tmdbId={tmdbId} titleName={title.name} />}
      {user ? <FriendsOnTitle mediaType={mediaType} tmdbId={tmdbId} /> : null}

      {!myEntry && (
        <View style={{ gap: 8 }}>
          <Button label={RANK_LABEL[mediaType]} onPress={startRank} />
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

      {mediaType === "tv" && user && title.seasons.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>Seasons</Text>
          <Muted>Open a season to rank its episodes. A season's score fills in from its episodes until you rank the season itself.</Muted>
          {title.seasons.map((meta) => {
            const s = seasonScores.get(meta.seasonNumber);
            return (
              <Pressable
                key={meta.seasonNumber}
                onPress={() => router.push(`/season/${tmdbId}/${meta.seasonNumber}`)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12, minHeight: 60 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{seasonName(meta.seasonNumber, meta.name)}</Text>
                  <Muted>
                    {meta.episodeCount} episodes
                    {s ? (s.source === "episodes" ? ` · ${sourceNote(s.rankedEpisodes, "episode").toLowerCase()}` : " · ranked") : ""}
                  </Muted>
                </View>
                {s ? <ScoreBadge score={s.score} /> : <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>}
              </Pressable>
            );
          })}
          <Button label="Rank a season" tone="ghost" onPress={() => setSeasonMode("one")} />
          {myEntry && <Button label="Rank every season you watched" tone="ghost" onPress={() => setSeasonMode("batch")} />}
        </View>
      )}

      {ranking && <RankSheet title={title} existing={myEntry} initialCompanions={myEntry ? undefined : tagger} onClose={() => setRanking(false)} />}
      {seasonMode && <SeasonSheet title={title} mode={seasonMode} onClose={() => setSeasonMode(null)} />}
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
  seasonAverage,
}: {
  title: Title;
  entry: Entry;
  seasonAverage: number | null;
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
        <ScoreBadge score={entry.score} size={64} />
        <View style={{ flex: 1 }}>
          <Muted>Your score in {entry.genreName}</Muted>
          {entry.watchedAt ? (
            <Muted>
              {doneVerb(title.mediaType)} {entry.watchedAt}
            </Muted>
          ) : null}
          {seasonAverage !== null ? <Muted>Your seasons average {seasonAverage.toFixed(1)}</Muted> : null}
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
          <DateField label={`${doneVerb(title.mediaType)} on`} value={editing.watchedAt} onChange={(watchedAt) => onChange({ ...editing, watchedAt })} noFuture />
          <CompanionPicker
            label={`${doneVerb(title.mediaType)} with`}
            value={editing.companions}
            onChange={(companions) => onChange({ ...editing, companions })}
          />
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
          {companionNames(entry.companions) ? (
            <Muted>
              {doneVerb(title.mediaType)} with {companionNames(entry.companions)}
            </Muted>
          ) : null}
          {entry.favoriteEpisode ? <Text style={{ color: colors.liked }}>Favorite: {formatEpisode(entry.favoriteEpisode)}</Text> : null}
          {entry.leastFavoriteEpisode ? <Text style={{ color: colors.disliked }}>Least favorite: {formatEpisode(entry.leastFavoriteEpisode)}</Text> : null}
          <Button label="Re-rank" tone="ghost" onPress={onRerank} />
          <Button label="Edit" tone="ghost" onPress={onEdit} />
        </View>
      )}
    </View>
  );
}
