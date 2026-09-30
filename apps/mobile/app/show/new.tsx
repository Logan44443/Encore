import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import type { ScrollView } from "react-native";
import { api } from "@/api";
import { LiveForm } from "@/components/LiveForm";
import { AuthGate, Screen } from "@/components/ui";
import { formToPayload, showToForm, type LiveShowFormValues } from "@/live-form";

export default function NewShow() {
  return (
    <AuthGate>
      <NewShowForm />
    </AuthGate>
  );
}

function NewShowForm() {
  const params = useLocalSearchParams<{ performer?: string; mbid?: string; image?: string; kind?: string; name?: string; date?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const initial = showToForm();
  if (params.kind === "festival" || params.kind === "concert" || params.kind === "dj_set" || params.kind === "theatre" || params.kind === "comedy" || params.kind === "other") {
    initial.kind = params.kind;
  }
  if (params.name) initial.name = params.name;
  if (params.date) initial.date = params.date;
  if (params.performer) {
    initial.lineup = [
      {
        role: "headliner",
        songs: [],
        performer: {
          mbid: params.mbid ?? null,
          name: params.performer,
          disambiguation: null,
          country: null,
          type: null,
          imageUrl: params.image ?? null,
        },
      },
    ];
  }

  const create = useMutation({
    mutationFn: (v: LiveShowFormValues) => api.live.create(formToPayload(v)),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["live"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      router.replace(`/show/${res.show.id}`);
    },
  });

  return (
    <Screen scrollRef={scrollRef}>
      <LiveForm
        initial={initial}
        submitLabel="Save show"
        pending={create.isPending}
        error={create.error}
        onSubmit={(v) => create.mutate(v)}
        onInvalid={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
      />
    </Screen>
  );
}
