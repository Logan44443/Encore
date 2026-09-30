"use client";

import {
  PERFORMER_ROLES,
  SHOW_KIND_LABELS,
  SHOW_KINDS,
  type CreateLiveShowInput,
  type LiveShow,
  type Performer,
  type PerformerRole,
  type SetlistSummary,
  type ShowKind,
  type SongReaction,
} from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { ArrowDownIcon, ArrowUpIcon, HeartIcon, MapPinIcon, PlusIcon, SearchIcon, ThumbDownIcon, ThumbUpIcon, XIcon } from "./icons";
import { formatDate, PerformerPhoto } from "./live-show-card";
import { ErrorNote } from "./ui";

interface Song {
  title: string;
  encore: boolean;
  reaction: SongReaction | null;
  note: string;
}

interface Slot {
  performer: Performer;
  role: PerformerRole;
  songs: Song[];
}

interface VenueDraft {
  name: string;
  city: string;
  region: string;
  country: string;
  lat: number | null;
  lng: number | null;
  setlistFmId: string | null;
}

export interface LiveShowFormValues {
  kind: ShowKind;
  name: string;
  date: string;
  venue: VenueDraft;
  tourName: string;
  setlistFmId: string | null;
  rating: number | null;
  liked: string;
  disliked: string;
  notes: string;
  lineup: Slot[];
}

const ROLE_LABELS: Record<PerformerRole, string> = { headliner: "Headliner", support: "Support", guest: "Guest" };
const NAMED_KINDS: Partial<Record<ShowKind, string>> = {
  festival: "Festival name",
  theatre: "Production",
  comedy: "Show / special name",
  other: "Event name",
};

export function showToForm(s?: LiveShow): LiveShowFormValues {
  return {
    kind: s?.kind ?? "concert",
    name: s?.name ?? "",
    date: s?.date ?? "",
    venue: {
      name: s?.venue?.name ?? "",
      city: s?.venue?.city ?? "",
      region: s?.venue?.region ?? "",
      country: s?.venue?.country ?? "",
      lat: s?.venue?.lat ?? null,
      lng: s?.venue?.lng ?? null,
      setlistFmId: null,
    },
    tourName: s?.tourName ?? "",
    setlistFmId: s?.setlistFmId ?? null,
    rating: s?.rating ?? null,
    liked: s?.liked ?? "",
    disliked: s?.disliked ?? "",
    notes: s?.notes ?? "",
    lineup: (s?.lineup ?? []).map((slot) => ({
      performer: slot.performer,
      role: slot.role,
      songs: slot.songs.map((x) => ({ title: x.title, encore: x.encore, reaction: x.reaction, note: x.note ?? "" })),
    })),
  };
}

export function formToPayload(v: LiveShowFormValues): CreateLiveShowInput {
  const text = (s: string) => s.trim() || null;
  return {
    kind: v.kind,
    name: NAMED_KINDS[v.kind] ? text(v.name) : null,
    date: v.date,
    venue: v.venue.name.trim()
      ? {
          name: v.venue.name.trim(),
          city: text(v.venue.city),
          region: text(v.venue.region),
          country: text(v.venue.country),
          lat: v.venue.lat,
          lng: v.venue.lng,
          setlistFmId: v.venue.setlistFmId,
        }
      : null,
    tourName: text(v.tourName),
    setlistFmId: v.setlistFmId,
    rating: v.rating,
    liked: text(v.liked),
    disliked: text(v.disliked),
    notes: text(v.notes),
    lineup: v.lineup.map((slot) => ({
      role: slot.role,
      performer: slot.performer,
      songs: slot.songs.map((s) => ({ title: s.title, encore: s.encore, reaction: s.reaction, note: text(s.note) })),
    })),
  };
}

export function LiveShowForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial: LiveShowFormValues;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (v: LiveShowFormValues) => void;
}) {
  const [v, setV] = useState(initial);
  const [activeSlot, setActiveSlot] = useState(0);
  const set = <K extends keyof LiveShowFormValues>(k: K, val: LiveShowFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const setVenue = (patch: Partial<VenueDraft>) =>
    setV((p) => ({
      ...p,
      // Typing a different place invalidates the pinned coordinates.
      venue: { ...p.venue, ...patch, ...("lat" in patch ? {} : { lat: null, lng: null, setlistFmId: null }) },
    }));
  const setLineup = (lineup: Slot[]) => {
    setV((p) => ({ ...p, lineup }));
    setActiveSlot((i) => Math.min(i, Math.max(0, lineup.length - 1)));
  };

  const addPerformer = (performer: Performer) => {
    if (v.lineup.some((s) => (performer.mbid ? s.performer.mbid === performer.mbid : s.performer.name === performer.name))) return;
    setLineup([...v.lineup, { performer, role: v.lineup.length === 0 ? "headliner" : "support", songs: [] }]);
  };

  function applySetlist(slotIndex: number, s: SetlistSummary) {
    setV((p) => ({
      ...p,
      date: s.eventDate,
      venue: s.venue
        ? {
            name: s.venue.name,
            city: s.venue.city ?? "",
            region: s.venue.region ?? "",
            country: s.venue.country ?? "",
            lat: s.venue.lat,
            lng: s.venue.lng,
            setlistFmId: s.venue.setlistFmId,
          }
        : p.venue,
      tourName: s.tourName ?? p.tourName,
      setlistFmId: slotIndex === 0 ? s.id : p.setlistFmId,
      lineup: p.lineup.map((slot, i) =>
        i === slotIndex ? { ...slot, songs: s.songs.map((song) => ({ ...song, reaction: null, note: "" })) } : slot,
      ),
    }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (v.lineup.length && v.date) onSubmit(v);
  }

  const slot = v.lineup[activeSlot];
  const pinned = v.venue.lat !== null && v.venue.lng !== null;

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-4 font-bold">What kind of show?</h2>
        <div className="flex flex-wrap gap-2">
          {SHOW_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => set("kind", k)} className={`chip px-4 py-2 text-sm ${v.kind === k ? "chip-active" : ""}`}>
              {SHOW_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {NAMED_KINDS[v.kind] && (
          <div className="mt-4">
            <label className="label">{NAMED_KINDS[v.kind]}</label>
            <input className="input" value={v.name} onChange={(e) => set("name", e.target.value)} />
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-bold">Who performed?</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Add the headliner first, then any support acts.</p>
        {v.lineup.length > 0 && (
          <ol className="mb-4 space-y-2">
            {v.lineup.map((s, i) => (
              <li key={`${s.performer.mbid ?? s.performer.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-2">
                <PerformerPhoto performer={s.performer} size={44} className="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.performer.name}</p>
                  <p className="truncate text-xs text-muted">
                    {[s.performer.type, s.performer.country, s.performer.disambiguation].filter(Boolean).join(" · ") || "Added manually"}
                  </p>
                </div>
                <select
                  className="input w-32 py-1.5"
                  value={s.role}
                  onChange={(e) => setLineup(v.lineup.map((x, j) => (j === i ? { ...x, role: e.target.value as PerformerRole } : x)))}
                >
                  {PERFORMER_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <button type="button" className="p-1 text-muted hover:text-white" aria-label="Move up" onClick={() => setLineup(swap(v.lineup, i, i - 1))}>
                  <ArrowUpIcon size={16} />
                </button>
                <button type="button" className="p-1 text-muted hover:text-disliked" aria-label="Remove" onClick={() => setLineup(v.lineup.filter((_, j) => j !== i))}>
                  <XIcon size={16} />
                </button>
              </li>
            ))}
          </ol>
        )}
        <PerformerSearch onSelect={addPerformer} />
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-bold">When and where?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Date *</label>
            <input type="date" required className="input" value={v.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div>
            <label className="label">Venue</label>
            <input className="input" placeholder="e.g. Madison Square Garden" value={v.venue.name} onChange={(e) => setVenue({ name: e.target.value })} />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" value={v.venue.city} onChange={(e) => setVenue({ city: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">State / region</label>
              <input className="input" value={v.venue.region} onChange={(e) => setVenue({ region: e.target.value })} />
            </div>
            <div>
              <label className="label">Country</label>
              <input className="input" value={v.venue.country} onChange={(e) => setVenue({ country: e.target.value })} />
            </div>
          </div>
          {v.kind !== "theatre" && v.kind !== "comedy" && (
            <div className="sm:col-span-2">
              <label className="label">Tour</label>
              <input className="input" value={v.tourName} onChange={(e) => set("tourName", e.target.value)} />
            </div>
          )}
        </div>
        {pinned && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-liked">
            <MapPinIcon size={14} /> Location pinned from setlist.fm
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-bold">What did they play?</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Each act gets its own setlist. Mark what you loved and what you could&apos;ve skipped.</p>
        {v.lineup.length === 0 ? (
          <p className="text-sm text-muted">Add a performer above first.</p>
        ) : (
          <>
            {v.lineup.length > 1 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {v.lineup.map((s, i) => (
                  <button key={i} type="button" onClick={() => setActiveSlot(i)} className={`chip ${i === activeSlot ? "chip-active" : ""}`}>
                    {s.performer.name} <span className="text-muted">{s.songs.length}</span>
                  </button>
                ))}
              </div>
            )}
            {slot?.performer.mbid && (
              <SetlistImporter key={slot.performer.mbid} mbid={slot.performer.mbid} date={v.date} onPick={(s) => applySetlist(activeSlot, s)} />
            )}
            {slot && (
              <SongEditor
                songs={slot.songs}
                onChange={(songs) => setLineup(v.lineup.map((x, j) => (j === activeSlot ? { ...x, songs } : x)))}
              />
            )}
          </>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-bold">How was it?</h2>
        <label className="label">
          Overall rating: <span className="text-brand">{v.rating === null ? "—" : `${v.rating.toFixed(1)} / 10`}</span>
        </label>
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={v.rating ?? 5}
          onChange={(e) => set("rating", Number(e.target.value))}
          className="w-full accent-brand"
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label text-liked!">What you liked</label>
            <textarea className="input min-h-24" value={v.liked} onChange={(e) => set("liked", e.target.value)} />
          </div>
          <div>
            <label className="label text-disliked!">What you didn&apos;t like</label>
            <textarea className="input min-h-24" value={v.disliked} onChange={(e) => set("disliked", e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <label className="label">Other notes</label>
          <textarea className="input min-h-20" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </section>

      <ErrorNote error={error} />
      <button className="btn-primary w-full py-3 text-base" disabled={pending || v.lineup.length === 0 || !v.date}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function swap<T>(list: T[], i: number, j: number): T[] {
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function PerformerSearch({ onSelect }: { onSelect: (p: Performer) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["performers", debounced],
    queryFn: () => api.music.searchPerformers(debounced),
    enabled: debounced.length >= 2,
    staleTime: Infinity,
  });

  const pick = (p: Performer) => {
    onSelect(p);
    setQ("");
    setDebounced("");
  };

  return (
    <div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" size={18} />
        <input className="input pl-10" placeholder="Search musicians, bands, DJs, comedians…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorNote error={error} />
      {isFetching && <p className="mt-3 text-sm text-muted">Searching…</p>}
      {debounced.length >= 2 && !isFetching && (
        <div className="mt-3 space-y-1.5">
          {data?.performers.map((p, i) => (
            <button
              key={p.mbid ?? `${p.name}-${i}`}
              type="button"
              onClick={() => pick(p)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel-2 p-2 text-left transition hover:border-brand/60"
            >
              <PerformerPhoto performer={p} size={40} className="rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-xs text-muted">{[p.type, p.country, p.disambiguation].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick({ mbid: null, name: debounced, disambiguation: null, country: null, type: null, imageUrl: null })}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-line px-4 py-2.5 text-left text-sm text-muted transition hover:border-brand/60 hover:text-white"
          >
            <PlusIcon size={16} /> Add &ldquo;{debounced}&rdquo; manually
          </button>
        </div>
      )}
    </div>
  );
}

function SetlistImporter({ mbid, date, onPick }: { mbid: string; date: string; onPick: (s: SetlistSummary) => void }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, error } = useQuery({
    queryKey: ["setlists", mbid, date],
    queryFn: () => api.music.setlists(mbid, date ? { date } : {}),
    enabled: open,
  });

  if (!open) {
    return (
      <button type="button" className="btn-ghost mb-4" onClick={() => setOpen(true)}>
        <SearchIcon size={16} /> Find the setlist on setlist.fm
      </button>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-line bg-panel-2 p-3">
      <ErrorNote error={error} />
      {isFetching && <p className="text-sm text-muted">Looking up setlists{date ? ` for ${formatDate(date)}` : ""}…</p>}
      {data && !data.enabled && <p className="text-sm text-muted">Setlist import isn&apos;t configured on this server. Add songs manually below.</p>}
      {data?.enabled && data.setlists.length === 0 && (
        <p className="text-sm text-muted">No setlists found{date ? " for that date" : ""}. Add songs manually below.</p>
      )}
      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {data?.setlists.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onPick(s);
              setOpen(false);
            }}
            className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm transition hover:border-brand/60"
          >
            <span className="font-medium">{formatDate(s.eventDate)}</span>
            <span className="text-muted"> · {[s.venue?.name, s.venue?.city].filter(Boolean).join(", ")}</span>
            <span className="block text-xs text-muted">
              {s.songs.length} songs{s.tourName && ` · ${s.tourName}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const REACTIONS: { value: SongReaction; icon: typeof HeartIcon; label: string; active: string }[] = [
  { value: "loved", icon: HeartIcon, label: "Loved", active: "text-brand-2 bg-brand-2/15 border-brand-2/50" },
  { value: "liked", icon: ThumbUpIcon, label: "Liked", active: "text-liked bg-liked/15 border-liked/50" },
  { value: "disliked", icon: ThumbDownIcon, label: "Didn't like", active: "text-disliked bg-disliked/15 border-disliked/50" },
];

function SongEditor({ songs, onChange }: { songs: Song[]; onChange: (s: Song[]) => void }) {
  const [draft, setDraft] = useState("");
  const update = (i: number, patch: Partial<Song>) => onChange(songs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => {
    if (!draft.trim()) return;
    onChange([...songs, { title: draft.trim(), encore: false, reaction: null, note: "" }]);
    setDraft("");
  };

  return (
    <div>
      <ol className="space-y-1.5">
        {songs.map((s, i) => (
          <li key={i} className="flex items-center gap-2 rounded-xl border border-line bg-panel-2 px-2 py-1.5">
            <span className="w-6 text-center text-xs text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {s.title}
              {s.encore && <span className="ml-2 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand uppercase">Encore</span>}
            </span>
            <div className="flex gap-1">
              {REACTIONS.map(({ value, icon: Icon, label, active }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={s.reaction === value}
                  onClick={() => update(i, { reaction: s.reaction === value ? null : value })}
                  className={`rounded-lg border p-1.5 transition ${s.reaction === value ? active : "border-transparent text-muted hover:text-white"}`}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
            <div className="hidden gap-0.5 sm:flex">
              <button type="button" className="p-1 text-muted hover:text-white" onClick={() => update(i, { encore: !s.encore })} title="Toggle encore">
                <span className="text-[10px] font-bold">E</span>
              </button>
              <button type="button" className="p-1 text-muted hover:text-white" onClick={() => onChange(swap(songs, i, i - 1))} aria-label="Move up">
                <ArrowUpIcon size={15} />
              </button>
              <button type="button" className="p-1 text-muted hover:text-white" onClick={() => onChange(swap(songs, i, i + 1))} aria-label="Move down">
                <ArrowDownIcon size={15} />
              </button>
            </div>
            <button type="button" className="p-1 text-muted hover:text-disliked" onClick={() => onChange(songs.filter((_, j) => j !== i))} aria-label="Remove">
              <XIcon size={15} />
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        <input
          className="input"
          placeholder="Add a song…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-ghost" onClick={add} aria-label="Add song">
          <PlusIcon size={18} />
        </button>
      </div>
    </div>
  );
}
