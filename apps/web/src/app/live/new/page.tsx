"use client";

import type { ShowKind } from "@encore/shared";
import { SHOW_KINDS } from "@encore/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { formToPayload, LiveShowForm, showToForm, type LiveShowFormValues } from "@/components/live-show-form";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { RequireAuth } from "@/lib/auth";

/** Supports `?performer=&mbid=&image=` (from an artist on your watchlist) and `?kind=festival&name=&date=`. */
function initialFromParams(params: URLSearchParams): LiveShowFormValues {
  const values = showToForm();
  const kind = params.get("kind");
  if (kind && (SHOW_KINDS as readonly string[]).includes(kind)) values.kind = kind as ShowKind;
  values.name = params.get("name") ?? "";
  values.date = params.get("date") ?? "";
  const performer = params.get("performer");
  if (performer) {
    values.lineup = [
      {
        role: "headliner",
        songs: [],
        performer: {
          mbid: params.get("mbid"),
          name: performer,
          imageUrl: params.get("image"),
          disambiguation: null,
          country: null,
          type: null,
        },
      },
    ];
  }
  return values;
}

function NewLiveShow() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const initial = useMemo(() => initialFromParams(new URLSearchParams(params.toString())), [params]);
  const create = useMutation({
    mutationFn: (v: LiveShowFormValues) => api.live.create(formToPayload(v)),
    onSuccess: ({ show }) => {
      queryClient.invalidateQueries({ queryKey: ["live"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      router.push(`/live/${show.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a live show" subtitle="Concerts, festivals, DJ sets, theatre, comedy — if you were in the room, it counts." />
      <LiveShowForm
        initial={initial}
        submitLabel="Save show"
        pending={create.isPending}
        error={create.error}
        onSubmit={(v) => create.mutate(v)}
      />
    </div>
  );
}

export default function NewLiveShowPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Spinner />}>
        <NewLiveShow />
      </Suspense>
    </RequireAuth>
  );
}
