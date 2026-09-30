import { SHOW_KIND_LABELS, type SongReaction } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { api } from "@/api";
import { LiveForm } from "@/components/LiveForm";
import { AuthGate, Button, Card, ErrorText, H1, Loading, Muted, Screen } from "@/components/ui";
import { formatDate, formatPlace, mapUrl, showTitle } from "@/format";
import { formToPayload, showToForm, type LiveShowFormValues } from "@/live-form";
import { colors } from "@/theme";

const REACTION: Record<SongReaction, string> = { loved: "Loved", liked: "Liked", disliked: "Didn't like" };

export default function ShowDetail() {
  return (
    <AuthGate>
      <Detail />
    </AuthGate>
  );
}

function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { data, error, isLoading } = useQuery({ queryKey: ["live", id], queryFn: () => api.live.get(id!), enabled: Boolean(id) });

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
  return (
    <Screen>
      <Muted>
        {formatDate(show.date)} · {SHOW_KIND_LABELS[show.kind]}
      </Muted>
      <H1>{showTitle(show)}</H1>
      {show.rating !== null && <Text style={{ color: colors.brand, fontSize: 28, fontWeight: "900" }}>{show.rating.toFixed(1)}</Text>}
      {show.venue && (
        <Card>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{show.venue.name}</Text>
          {place ? <Muted>{place}</Muted> : null}
          <Button label="Open in Maps" tone="ghost" onPress={() => Linking.openURL(mapUrl(show.venue!))} />
        </Card>
      )}
      {show.tourName ? <Muted>Tour · {show.tourName}</Muted> : null}
      {show.liked ? <Card><Muted>Liked</Muted><Text style={{ color: colors.text }}>{show.liked}</Text></Card> : null}
      {show.disliked ? <Card><Muted>Didn't like</Muted><Text style={{ color: colors.text }}>{show.disliked}</Text></Card> : null}
      {show.notes ? <Card><Muted>Notes</Muted><Text style={{ color: colors.text }}>{show.notes}</Text></Card> : null}
      {show.lineup.map((slot, i) => (
        <Card key={`${slot.performer.mbid ?? slot.performer.name}-${i}`}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{slot.performer.name}</Text>
          <Muted>{slot.role}</Muted>
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
      <Button label="Edit" tone="ghost" onPress={() => setEditing(true)} />
      <Button
        label="Delete show"
        tone="danger"
        onPress={() =>
          Alert.alert("Delete this show?", undefined, [
            { text: "Cancel" },
            { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
          ])
        }
      />
    </Screen>
  );
}
