"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { EntryRow } from "@/components/entry-row";
import { BookmarkIcon, FilmIcon, FlameIcon, TicketIcon, TvIcon } from "@/components/icons";
import { LiveShowCard, PerformerPhoto } from "@/components/live-show-card";
import { Poster } from "@/components/poster";
import { TitleGrid } from "@/components/title-grid";
import { Empty, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWatchlist } from "@/lib/watchlist";

export default function Home() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  return user ? <Dashboard name={user.displayName} /> : <Landing />;
}

function Landing() {
  const features = [
    { icon: FilmIcon, title: "Rank movies by genre", body: "Liked it? Compare it head-to-head with your other thrillers, comedies or dramas. Your list ranks itself." },
    { icon: TvIcon, title: "Track every series", body: "Score shows the same way, and remember your favorite and least favorite episodes." },
    {
      icon: TicketIcon,
      title: "Relive every show",
      body: "Concerts, festivals, DJ sets, theatre. Save who played, where it was, the setlist and the moments that made the night.",
    },
    {
      icon: BookmarkIcon,
      title: "A watchlist that covers everything",
      body: "Save movies and shows to watch, artists you want to see live, and festivals you don't want to miss. They come off the list once you rank or log them.",
    },
  ];
  return (
    <div className="py-10 sm:py-20">
      <h1 className="max-w-3xl text-4xl leading-[1.05] font-black tracking-tight sm:text-6xl">
        Everything you watch. <span className="text-gradient">Every show you&apos;re at.</span>
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        Encore turns quick head-to-head choices into honest scores for your movies and TV, and keeps a record of every live show you&apos;ve been to.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/register" className="btn-primary px-6 py-3 text-base">Get started</Link>
        <Link href="/search" className="btn-ghost px-6 py-3 text-base">Browse titles</Link>
      </div>
      <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-6">
            <Icon className="text-brand" size={26} />
            <h3 className="mt-4 font-bold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ name }: { name: string }) {
  const entries = useQuery({ queryKey: ["entries", "all"], queryFn: () => api.entries.list() });
  const live = useQuery({ queryKey: ["live"], queryFn: () => api.live.list() });
  const watchlist = useWatchlist();
  const trending = useQuery({ queryKey: ["trending", "movie"], queryFn: () => api.catalog.trending("movie"), staleTime: 60_000 });
  const upcoming = watchlist.data?.items.slice(0, 4) ?? [];

  const recent = [...(entries.data?.entries ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Hey, {name}</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link href="/search?type=movie" className="card flex flex-col items-center gap-2 p-4 text-center text-sm font-semibold hover:border-brand/60">
            <FilmIcon className="text-brand" /> Rank a movie
          </Link>
          <Link href="/search?type=tv" className="card flex flex-col items-center gap-2 p-4 text-center text-sm font-semibold hover:border-brand/60">
            <TvIcon className="text-brand" /> Rank a series
          </Link>
          <Link href="/live/new" className="card flex flex-col items-center gap-2 p-4 text-center text-sm font-semibold hover:border-brand/60">
            <TicketIcon className="text-brand" /> Add a live show
          </Link>
          <Link href="/watchlist" className="card flex flex-col items-center gap-2 p-4 text-center text-sm font-semibold hover:border-brand/60">
            <BookmarkIcon className="text-brand" /> Watchlist
          </Link>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-bold">Up next</h2>
          <Link href="/watchlist" className="text-sm text-brand">Watchlist</Link>
        </div>
        {watchlist.isLoading ? (
          <Spinner />
        ) : upcoming.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {upcoming.map((item) => (
              <Link
                key={item.id}
                href={
                  item.title
                    ? `/title/${item.kind}/${item.title.tmdbId}`
                    : item.performer
                      ? `/watchlist?tab=performer`
                      : `/watchlist?tab=festival`
                }
                className="card p-2 transition hover:border-zinc-600"
              >
                {item.title ? (
                  <Poster src={item.title.posterUrl} name={item.title.name} sizes="180px" />
                ) : item.performer ? (
                  <PerformerPhoto performer={item.performer} size={0} className="aspect-square w-full rounded-xl" />
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-xl bg-gradient-to-br from-brand/30 to-brand-2/30">
                    <TicketIcon className="text-white/90" />
                  </div>
                )}
                <p className="mt-1.5 truncate text-sm font-medium">
                  {item.title?.name ?? item.performer?.name ?? item.festival?.name}
                </p>
                <p className="text-xs text-muted capitalize">{item.kind === "performer" ? "Artist" : item.kind === "tv" ? "TV" : item.kind}</p>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="Nothing saved yet">
            Bookmark a movie or show, or add an artist or festival on your <Link href="/watchlist" className="text-brand">watchlist</Link>.
          </Empty>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-bold">Recently ranked</h2>
          <Link href="/lists" className="text-sm text-brand">All rankings</Link>
        </div>
        {entries.isLoading ? (
          <Spinner />
        ) : recent.length ? (
          <div className="space-y-2">{recent.map((e) => <EntryRow key={e.id} entry={e} />)}</div>
        ) : (
          <Empty title="No rankings yet">Pick something you watched recently from Discover.</Empty>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-bold">Recent live shows</h2>
          <Link href="/live" className="text-sm text-brand">All shows</Link>
        </div>
        {live.isLoading ? (
          <Spinner />
        ) : live.data?.shows.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {live.data.shows.slice(0, 4).map((s) => <LiveShowCard key={s.id} show={s} />)}
          </div>
        ) : (
          <Empty title="No live shows yet">
            <Link href="/live/new" className="text-brand">Add the last show you went to</Link>
          </Empty>
        )}
      </section>

      {trending.data && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 font-bold">
              <FlameIcon size={18} className="text-brand" /> Trending movies
            </h2>
            <Link href="/search?type=movie" className="text-sm text-brand">Discover</Link>
          </div>
          <TitleGrid items={trending.data.results.slice(0, 12)} show="trending" />
        </section>
      )}
    </div>
  );
}
