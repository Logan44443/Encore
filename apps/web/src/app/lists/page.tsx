"use client";

import type { MediaType } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { EntryRow } from "@/components/entry-row";
import { FilmIcon, TvIcon } from "@/components/icons";
import { Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { RequireAuth } from "@/lib/auth";

function Rankings() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const type = (params.get("type") === "tv" ? "tv" : "movie") as MediaType;
  const genreParam = params.get("genre");
  const genreId = genreParam ? Number(genreParam) : null;

  const { data, error, isLoading } = useQuery({
    queryKey: ["entries", type],
    queryFn: () => api.entries.list({ mediaType: type }),
  });

  const genres = useMemo(() => {
    const counts = new Map<number, { name: string; count: number }>();
    for (const e of data?.entries ?? []) {
      const g = counts.get(e.genreId) ?? { name: e.genreName, count: 0 };
      g.count++;
      counts.set(e.genreId, g);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [data]);

  const entries = (data?.entries ?? []).filter((e) => genreId === null || e.genreId === genreId);
  const go = (next: { type?: MediaType; genre?: number | null }) => {
    const qs = new URLSearchParams({ type: next.type ?? type });
    const g = next.genre === undefined ? genreId : next.genre;
    if (g !== null && next.type === undefined) qs.set("genre", String(g));
    router.replace(`${pathname}?${qs}`, { scroll: false });
  };

  return (
    <>
      <PageHeader
        title="Your rankings"
        subtitle="Scores come from head-to-head comparisons within each genre."
        action={<Link href={`/search?type=${type}`} className="btn-primary">Rank something</Link>}
      />
      <div className="flex gap-2">
        <button className={`chip px-4 py-1.5 text-sm ${type === "movie" ? "chip-active" : ""}`} onClick={() => go({ type: "movie" })}>
          <FilmIcon size={16} /> Movies
        </button>
        <button className={`chip px-4 py-1.5 text-sm ${type === "tv" ? "chip-active" : ""}`} onClick={() => go({ type: "tv" })}>
          <TvIcon size={16} /> TV Shows
        </button>
      </div>

      {genres.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={`chip ${genreId === null ? "chip-active" : ""}`} onClick={() => go({ genre: null })}>
            All
          </button>
          {genres.map(([id, g]) => (
            <button key={id} className={`chip ${genreId === id ? "chip-active" : ""}`} onClick={() => go({ genre: id })}>
              {g.name} <span className="text-muted">{g.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-2">
        <ErrorNote error={error} />
        {isLoading ? (
          <Spinner />
        ) : entries.length === 0 ? (
          <Empty title="Nothing ranked yet">
            <Link href={`/search?type=${type}`} className="text-brand">Find a {type === "movie" ? "movie" : "show"}</Link> you&apos;ve
            watched to start your list.
          </Empty>
        ) : (
          entries.map((e, i) => <EntryRow key={e.id} entry={e} rank={i + 1} />)
        )}
      </div>
    </>
  );
}

export default function ListsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Spinner />}>
        <Rankings />
      </Suspense>
    </RequireAuth>
  );
}
