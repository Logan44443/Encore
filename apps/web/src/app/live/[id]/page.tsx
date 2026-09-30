"use client";

import { SHOW_KIND_LABELS, type LiveSong, type SongReaction } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { HeartIcon, MapPinIcon, ThumbDownIcon, ThumbUpIcon } from "@/components/icons";
import { formatDate, formatPlace, mapUrl, PerformerPhoto, showTitle } from "@/components/live-show-card";
import { formToPayload, LiveShowForm, showToForm, type LiveShowFormValues } from "@/components/live-show-form";
import { ErrorNote, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { RequireAuth } from "@/lib/auth";

const REACTION_ICON: Record<SongReaction, { icon: typeof HeartIcon; className: string }> = {
  loved: { icon: HeartIcon, className: "text-brand-2" },
  liked: { icon: ThumbUpIcon, className: "text-liked" },
  disliked: { icon: ThumbDownIcon, className: "text-disliked" },
};

const ROLE_LABEL = { headliner: "Headliner", support: "Support", guest: "Guest" } as const;

function LiveShowDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data, error, isLoading } = useQuery({ queryKey: ["live", id], queryFn: () => api.live.get(id) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["live"] });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["watchlist"] });
  };
  const update = useMutation({
    mutationFn: (v: LiveShowFormValues) => api.live.update(id, formToPayload(v)),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.live.remove(id),
    onSuccess: () => {
      invalidate();
      router.push("/live");
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorNote error={error} />;
  const show = data.show;

  if (editing) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black">Edit show</h1>
          <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
        </div>
        <LiveShowForm
          initial={showToForm(show)}
          submitLabel="Save changes"
          pending={update.isPending}
          error={update.error}
          onSubmit={(v) => update.mutate(v)}
        />
      </div>
    );
  }

  const headliner = show.lineup.find((s) => s.role === "headliner") ?? show.lineup[0];
  const place = formatPlace(show.venue);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="card relative overflow-hidden">
        {headliner?.performer.imageUrl && (
          <Image src={headliner.performer.imageUrl} alt="" fill sizes="768px" className="scale-110 object-cover opacity-25 blur-2xl" />
        )}
        <div className="relative flex flex-col gap-5 bg-gradient-to-br from-brand/15 via-transparent to-transparent p-6 sm:flex-row sm:items-end">
          <PerformerPhoto performer={headliner?.performer} size={132} className="shadow-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              {SHOW_KIND_LABELS[show.kind]} · {formatDate(show.date, { weekday: "short", year: "numeric", month: "long", day: "numeric" })}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{showTitle(show)}</h1>
            {show.tourName && <p className="mt-1 text-sm text-zinc-300">{show.tourName}</p>}
            {show.venue && (
              <a href={mapUrl(show.venue)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-zinc-200 hover:text-brand">
                <MapPinIcon size={16} className="text-brand" />
                <span>
                  <span className="font-semibold">{show.venue.name}</span>
                  {place && <span className="text-muted"> · {place}</span>}
                </span>
              </a>
            )}
          </div>
          {show.rating !== null && (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-brand/60 bg-ink/40 text-xl font-black text-brand">
              {show.rating.toFixed(1)}
            </div>
          )}
        </div>
        <div className="relative flex justify-end gap-2 border-t border-line/60 px-6 py-3">
          <button className="btn-ghost py-1.5" onClick={() => setEditing(true)}>Edit</button>
          <button
            className="btn py-1.5 text-disliked hover:bg-disliked/10"
            disabled={remove.isPending}
            onClick={() => confirm("Delete this show?") && remove.mutate()}
          >
            Delete
          </button>
        </div>
      </header>

      {show.lineup.length > 1 && (
        <section className="card p-5">
          <h2 className="mb-3 font-bold">Lineup</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {show.lineup.map((slot, i) => (
              <div key={i} className="flex items-center gap-3">
                <PerformerPhoto performer={slot.performer} size={48} className="rounded-xl" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{slot.performer.name}</p>
                  <p className="text-xs text-muted">{ROLE_LABEL[slot.role]}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(show.liked || show.disliked) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {show.liked && (
            <div className="card p-5">
              <p className="label text-liked!">What I liked</p>
              <p className="text-sm leading-relaxed whitespace-pre-line text-zinc-300">{show.liked}</p>
            </div>
          )}
          {show.disliked && (
            <div className="card p-5">
              <p className="label text-disliked!">What I didn&apos;t like</p>
              <p className="text-sm leading-relaxed whitespace-pre-line text-zinc-300">{show.disliked}</p>
            </div>
          )}
        </div>
      )}

      {show.lineup
        .filter((slot) => slot.songs.length > 0)
        .map((slot, i) => (
          <section key={i} className="card p-5">
            <h2 className="mb-3 flex items-center gap-3 font-bold">
              <PerformerPhoto performer={slot.performer} size={32} className="rounded-lg" />
              {slot.performer.name} <span className="text-sm font-normal text-muted">setlist</span>
            </h2>
            <SongList songs={slot.songs.filter((s) => !s.encore)} />
            {slot.songs.some((s) => s.encore) && (
              <>
                <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-brand uppercase">Encore</p>
                <SongList songs={slot.songs.filter((s) => s.encore)} />
              </>
            )}
          </section>
        ))}

      {show.notes && (
        <section className="card p-5">
          <p className="label">Notes</p>
          <p className="text-sm leading-relaxed whitespace-pre-line text-zinc-300">{show.notes}</p>
        </section>
      )}
    </div>
  );
}

function SongList({ songs }: { songs: LiveSong[] }) {
  return (
    <ol className="divide-y divide-line/60">
      {songs.map((s) => {
        const r = s.reaction ? REACTION_ICON[s.reaction] : null;
        return (
          <li key={s.position} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-6 text-right text-xs text-muted">{s.position}</span>
            <span className="flex-1">{s.title}</span>
            {r && <r.icon size={16} className={r.className} />}
          </li>
        );
      })}
    </ol>
  );
}

export default function LiveShowPage() {
  return (
    <RequireAuth>
      <LiveShowDetail />
    </RequireAuth>
  );
}
