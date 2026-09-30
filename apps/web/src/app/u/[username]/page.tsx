"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { EntryRow } from "@/components/entry-row";
import { LiveShowCard } from "@/components/live-show-card";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { data, error, isLoading } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => api.users.profile(username),
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorNote error={error} />;
  const { user, stats, topMovies, topShows, recentLiveShows } = data;

  const statItems = [
    { label: "Movies", value: stats.movies },
    { label: "Series", value: stats.series },
    { label: "Live shows", value: stats.liveShows },
    { label: "Performers", value: stats.performers },
    { label: "Cities", value: stats.cities },
  ];

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-center gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-3xl font-black">
          {user.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-black tracking-tight">{user.displayName}</h1>
          <p className="text-sm text-muted">@{user.username}</p>
        </div>
        <div className="grid w-full grid-cols-5 gap-2 sm:w-auto">
          {statItems.map((s) => (
            <div key={s.label} className="card px-2 py-3 text-center sm:px-4">
              <p className="text-xl font-black">{s.value}</p>
              <p className="text-[11px] text-muted uppercase">{s.label}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-bold">Top movies</h2>
          {topMovies.length ? (
            <div className="space-y-2">{topMovies.map((e, i) => <EntryRow key={e.id} entry={e} rank={i + 1} />)}</div>
          ) : (
            <Empty title="No movies ranked yet" />
          )}
        </section>
        <section>
          <h2 className="mb-3 font-bold">Top series</h2>
          {topShows.length ? (
            <div className="space-y-2">{topShows.map((e, i) => <EntryRow key={e.id} entry={e} rank={i + 1} />)}</div>
          ) : (
            <Empty title="No series ranked yet" />
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-bold">Recent live shows</h2>
        {recentLiveShows.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {recentLiveShows.map((s) => <LiveShowCard key={s.id} show={s} />)}
          </div>
        ) : (
          <Empty title="No live shows yet" />
        )}
      </section>
    </div>
  );
}
