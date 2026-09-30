"use client";

import { WATCHLIST_KIND_LABELS, WATCHLIST_KINDS, type WatchlistItem, type WatchlistKind } from "@encore/shared";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { BookmarkIcon, CalendarIcon, FilmIcon, MapPinIcon, SearchIcon, TicketIcon, TvIcon, XIcon } from "@/components/icons";
import { formatDate, PerformerPhoto } from "@/components/live-show-card";
import { PerformerSearch } from "@/components/live-show-form";
import { Poster } from "@/components/poster";
import { Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { RequireAuth } from "@/lib/auth";
import { useWatchlist, useWatchlistMutations } from "@/lib/watchlist";

type Tab = "all" | WatchlistKind;

function daysUntil(iso: string) {
  const ms = new Date(`${iso}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime();
  return Math.round(ms / 86_400_000);
}

function actionFor(item: WatchlistItem): { href: string; label: string } {
  if (item.title) return { href: `/title/${item.kind}/${item.title.tmdbId}`, label: "Watched it? Rank it" };
  if (item.performer) {
    const qs = new URLSearchParams({ performer: item.performer.name });
    if (item.performer.mbid) qs.set("mbid", item.performer.mbid);
    if (item.performer.imageUrl) qs.set("image", item.performer.imageUrl);
    return { href: `/live/new?${qs}`, label: "Saw them? Log it" };
  }
  const f = item.festival!;
  const qs = new URLSearchParams({ kind: "festival", name: f.name, ...(f.date ? { date: f.date } : {}) });
  return { href: `/live/new?${qs}`, label: "Went? Log it" };
}

function WatchlistRow({ item }: { item: WatchlistItem }) {
  const { remove } = useWatchlistMutations();
  const action = actionFor(item);

  let media: React.ReactNode;
  let title: string;
  let meta: React.ReactNode;
  if (item.title) {
    media = <Poster src={item.title.posterUrl} name={item.title.name} className="w-14 shrink-0 rounded-lg" sizes="56px" />;
    title = item.title.name;
    meta = [item.kind === "movie" ? "Movie" : "TV show", item.title.year].filter(Boolean).join(" · ");
  } else if (item.performer) {
    media = <PerformerPhoto performer={item.performer} size={56} className="rounded-xl" />;
    title = item.performer.name;
    meta = ["Artist", item.performer.type, item.performer.country].filter(Boolean).join(" · ");
  } else {
    const f = item.festival!;
    const days = f.date ? daysUntil(f.date) : null;
    media = (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/30 to-brand-2/30">
        <TicketIcon className="text-white/90" />
      </div>
    );
    title = f.name;
    meta = (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span>Festival</span>
        {f.date && (
          <span className="flex items-center gap-1">
            <CalendarIcon size={12} /> {formatDate(f.date)}
            {days !== null && days >= 0 && <span className="text-brand">{days === 0 ? "· today" : `· in ${days} days`}</span>}
          </span>
        )}
        {(f.city || f.country) && (
          <span className="flex items-center gap-1">
            <MapPinIcon size={12} /> {[f.city, f.country].filter(Boolean).join(", ")}
          </span>
        )}
      </span>
    );
  }

  const body = (
    <div className="min-w-0 flex-1">
      <p className="truncate font-semibold">{title}</p>
      <div className="text-xs text-muted">{meta}</div>
      {item.note && <p className="mt-1 line-clamp-1 text-sm text-zinc-400">{item.note}</p>}
    </div>
  );

  return (
    <li className="card flex items-center gap-4 p-3">
      {item.title ? (
        <Link href={action.href} className="flex min-w-0 flex-1 items-center gap-4">
          {media}
          {body}
        </Link>
      ) : (
        <>
          {media}
          {body}
        </>
      )}
      <Link href={action.href} className="btn-ghost shrink-0 px-3 py-1.5 text-xs">
        <span className="sm:hidden">{item.title ? "Rank" : "Log"}</span>
        <span className="hidden sm:inline">{action.label}</span>
      </Link>
      <button
        className="shrink-0 p-1.5 text-muted hover:text-disliked"
        aria-label="Remove from watchlist"
        disabled={remove.isPending}
        onClick={() => remove.mutate(item.id)}
      >
        <XIcon size={18} />
      </button>
    </li>
  );
}

function AddFestival() {
  const { add } = useWatchlistMutations();
  const [f, setF] = useState({ name: "", date: "", city: "", country: "", note: "" });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    add.mutate(
      { kind: "festival", name: f.name, date: f.date || null, city: f.city || null, country: f.country || null, note: f.note || null },
      { onSuccess: () => setF({ name: "", date: "", city: "", country: "", note: "" }) },
    );
  };
  const field = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <input className="input sm:col-span-2" placeholder="Festival name, e.g. Glastonbury 2027" required {...field("name")} />
      <input className="input" type="date" {...field("date")} />
      <div className="grid grid-cols-2 gap-3">
        <input className="input" placeholder="City" {...field("city")} />
        <input className="input" placeholder="Country" {...field("country")} />
      </div>
      <input className="input sm:col-span-2" placeholder="Note (who you're going with, tickets…)" {...field("note")} />
      <ErrorNote error={add.error} />
      <button className="btn-primary sm:col-span-2" disabled={add.isPending}>
        Add festival
      </button>
    </form>
  );
}

function AddPanel({ tab }: { tab: Tab }) {
  const { add } = useWatchlistMutations();
  if (tab === "performer") {
    return (
      <div className="card p-5">
        <h2 className="mb-3 font-bold">Add an artist you want to see live</h2>
        <PerformerSearch onSelect={(performer) => add.mutate({ kind: "performer", performer })} />
        <ErrorNote error={add.error} />
      </div>
    );
  }
  if (tab === "festival") {
    return (
      <div className="card p-5">
        <h2 className="mb-3 font-bold">Add a festival</h2>
        <AddFestival />
      </div>
    );
  }
  const type = tab === "tv" ? "tv" : "movie";
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="text-sm text-muted">
        Tap the <BookmarkIcon size={14} className="inline text-brand" /> on any poster in Discover or Picks, or use &ldquo;Add to watchlist&rdquo; on a title page.
      </p>
      <Link href={`/search?type=${type}`} className="btn-ghost py-1.5">
        <SearchIcon size={16} /> Find {tab === "tv" ? "shows" : tab === "movie" ? "movies" : "something"}
      </Link>
    </div>
  );
}

const TAB_ICON: Record<WatchlistKind, typeof FilmIcon> = { movie: FilmIcon, tv: TvIcon, performer: TicketIcon, festival: CalendarIcon };

function Watchlist() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: Tab = raw && (WATCHLIST_KINDS as readonly string[]).includes(raw) ? (raw as WatchlistKind) : "all";
  const { data, error, isLoading } = useWatchlist();
  const items = data?.items ?? [];

  const counts = Object.fromEntries(WATCHLIST_KINDS.map((k) => [k, items.filter((i) => i.kind === k).length])) as Record<WatchlistKind, number>;
  let visible = tab === "all" ? items : items.filter((i) => i.kind === tab);
  if (tab === "festival") {
    visible = [...visible].sort((a, b) => (a.festival?.date ?? "9999").localeCompare(b.festival?.date ?? "9999"));
  }

  const setTab = (t: Tab) => router.replace(t === "all" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  return (
    <>
      <PageHeader title="Watchlist" subtitle="Movies and shows to watch, artists to see live, festivals to get to. Items cross themselves off once you rank or log them." />
      <div className="flex flex-wrap gap-2">
        <button className={`chip px-4 py-1.5 text-sm ${tab === "all" ? "chip-active" : ""}`} onClick={() => setTab("all")}>
          All <span className="text-muted">{items.length}</span>
        </button>
        {WATCHLIST_KINDS.map((k) => {
          const Icon = TAB_ICON[k];
          return (
            <button key={k} className={`chip px-4 py-1.5 text-sm ${tab === k ? "chip-active" : ""}`} onClick={() => setTab(k)}>
              <Icon size={15} /> {WATCHLIST_KIND_LABELS[k]} <span className="text-muted">{counts[k]}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <AddPanel tab={tab} />
      </div>

      <div className="mt-6">
        <ErrorNote error={error} />
        {isLoading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <Empty title="Nothing here yet">
            {tab === "all" ? "Save movies, shows, artists and festivals you don't want to forget." : `No ${WATCHLIST_KIND_LABELS[tab].toLowerCase()} saved yet.`}
          </Empty>
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => (
              <WatchlistRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function WatchlistPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Spinner />}>
        <Watchlist />
      </Suspense>
    </RequireAuth>
  );
}
