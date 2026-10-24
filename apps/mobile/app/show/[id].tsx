import { SHOW_KIND_LABELS, type SongReaction } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { LiveForm } from "@/components/LiveForm";
import { PerformerPhoto } from "@/components/PerformerPhoto";
import { AuthGate, Button, Card, CreditLine, ErrorText, H1, Loading, Muted, Screen } from "@/components/ui";
import { companionNames } from "@/companions";
import { formatDate, formatPlace, mapUrl, showPhoto, showTitle } from "@/format";
import { formToPayload, showToForm, type LiveShowFormValues } from "@/live-form";
import { colors, scoreColor } from "@/theme";

const REACTION: Record<SongReaction, string> = { loved: "Loved", liked: "Liked", disliked: "Didn't like" };

export default function ShowDetail() {
  return (
    <AuthGate>
      <Detail />
    </AuthGate>
  );
}

function Detail() {
  // `user` is set when opening someone else's show (from their profile): read-only.
  const { id, user: owner } = useLocalSearchParams<{ id: string; user?: string }>();
  const { user: me } = useAuth();
  const theirs = Boolean(owner && owner.toLowerCase() !== me?.username.toLowerCase());
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: theirs ? ["live", "user", owner, id] : ["live", id],
    queryFn: () => (theirs ? api.users.liveShow(owner!, id!) : api.live.get(id!)),
    enabled: Boolean(id),
  });

  const credits = useQuery({
    queryKey: ["credits", data?.show.id, data ? showPhoto(data.show).uri : null, data?.show.setlistFmId],
    queryFn: () => api.music.credits({ photo: showPhoto(data!.show).uri, setlist: data!.show.setlistFmId }),
    enabled: Boolean(data && (showPhoto(data.show).uri || data.show.setlistFmId)),
    staleTime: Infinity,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["live"] });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["watchlist"] });
  };
  const update = useMutation({
    mutationFn: (v: LiveShowFormValues) => api.live.update(id!, formToPayload(v)),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.live.remove(id!),
    onSuccess: () => {
      invalidate();
      router.replace("/live");
    },
  });

  if (isLoading) return <Loading />;
  if (error || !data) {
    return (
      <Screen>
        <ErrorText error={error} />
      </Screen>
    );
  }
  const show = data.show;
  if (editing) {
    return (
      <Screen scrollRef={scrollRef}>
        <Button label="Cancel" tone="ghost" onPress={() => setEditing(false)} />
        <LiveForm
          initial={showToForm(show)}
          submitLabel="Save changes"
          pending={update.isPending}
          error={update.error}
          onSubmit={(v) => update.mutate(v)}
          onInvalid={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        />
      </Screen>
    );
  }

  const place = formatPlace(show.venue);
  const hero = showPhoto(show);
  return (
    <Screen>
      {hero.uri ? (
        <Image
          source={{ uri: hero.uri }}
          style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: colors.panel2 }}
          contentFit="cover"
          contentPosition="top"
          transition={150}
          accessibilityLabel={hero.name}
        />
      ) : null}
      <CreditLine credit={credits.data?.photo} />
      <Muted>
        {formatDate(show.date)} · {SHOW_KIND_LABELS[show.kind]}
      </Muted>
      <H1>{showTitle(show)}</H1>
      {theirs ? <Muted>@{owner}'s show</Muted> : null}
      {show.rating !== null && <Text style={{ color: scoreColor(show.rating), fontSize: 28, fontWeight: "900" }}>{show.rating.toFixed(1)}</Text>}
      {show.venue && (
        <Card>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{show.venue.name}</Text>
          {place ? <Muted>{place}</Muted> : null}
          <Button label="Open in Maps" tone="ghost" onPress={() => Linking.openURL(mapUrl(show.venue!))} />
        </Card>
      )}
      {show.tourName ? <Muted>Tour · {show.tourName}</Muted> : null}
      {companionNames(show.companions) ? <Muted>With {companionNames(show.companions)}</Muted> : null}
      {show.liked ? <Card><Muted>Liked</Muted><Text style={{ color: colors.text }}>{show.liked}</Text></Card> : null}
      {show.disliked ? <Card><Muted>Didn't like</Muted><Text style={{ color: colors.text }}>{show.disliked}</Text></Card> : null}
      {show.notes ? <Card><Muted>Notes</Muted><Text style={{ color: colors.text }}>{show.notes}</Text></Card> : null}
      {show.lineup.map((slot, i) => (
        <Card key={`${slot.performer.mbid ?? slot.performer.name}-${i}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <PerformerPhoto uri={slot.performer.imageUrl} name={slot.performer.name} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>{slot.performer.name}</Text>
              <Muted>{slot.role}</Muted>
            </View>
          </View>
          {slot.songs.map((song) => (
            <View key={`${song.position}-${song.title}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: colors.text, flex: 1 }}>
                {song.position}. {song.title}
                {song.encore ? " · encore" : ""}
              </Text>
              {song.reaction ? <Text style={{ color: colors.brand }}>{REACTION[song.reaction]}</Text> : null}
            </View>
          ))}
        </Card>
      ))}
      <CreditLine credit={credits.data?.setlist} />
      {theirs ? null : <OwnerActions onEdit={() => setEditing(true)} onDelete={() => remove.mutate()} />}
    </Screen>
  );
}

function OwnerActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <Button label="Edit" tone="ghost" onPress={onEdit} />
      <Button
        label="Delete show"
        tone="danger"
        onPress={() =>
          Alert.alert("Delete this show?", undefined, [
            { text: "Cancel" },
            { text: "Delete", style: "destructive", onPress: onDelete },
          ])
        }
      />
    </>
  );
}
