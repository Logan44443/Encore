"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LiveShowCard } from "@/components/live-show-card";
import { Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { RequireAuth } from "@/lib/auth";

function LiveShows() {
  const { data, error, isLoading } = useQuery({ queryKey: ["live"], queryFn: () => api.live.list() });
  const shows = data?.shows ?? [];

  const performers = new Set(shows.flatMap((s) => s.lineup.map((l) => l.performer.mbid ?? l.performer.name)));
  const cities = new Set(shows.map((s) => s.venue?.city?.toLowerCase()).filter(Boolean));
  const byYear = new Map<string, typeof shows>();
  for (const s of shows) byYear.set(s.date.slice(0, 4), [...(byYear.get(s.date.slice(0, 4)) ?? []), s]);

  return (
    <>
      <PageHeader
        title="Live"
        subtitle="Every show you've been to — who played, where, and what hit."
        action={<Link href="/live/new" className="btn-primary">Add a show</Link>}
      />
      {shows.length > 0 && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          {[
            { label: "Shows", value: shows.length },
            { label: "Performers", value: performers.size },
            { label: "Cities", value: cities.size },
          ].map((s) => (
            <div key={s.label} className="card px-4 py-3 text-center">
              <p className="text-2xl font-black">{s.value}</p>
              <p className="text-[11px] text-muted uppercase">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      <ErrorNote error={error} />
      {isLoading ? (
        <Spinner />
      ) : shows.length === 0 ? (
        <Empty title="No shows yet">
          <Link href="/live/new" className="text-brand">Add the last show you saw</Link> — lineup, venue and setlist.
        </Empty>
      ) : (
        <div className="space-y-8">
          {[...byYear.entries()].map(([year, list]) => (
            <section key={year}>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{year}</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {list.map((s) => <LiveShowCard key={s.id} show={s} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export default function LivePage() {
  return (
    <RequireAuth>
      <LiveShows />
    </RequireAuth>
  );
}
