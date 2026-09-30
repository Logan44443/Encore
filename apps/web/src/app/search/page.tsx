"use client";

import type { MediaType } from "@encore/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { DemoCatalogNote } from "@/components/demo-catalog-note";
import { FilmIcon, FlameIcon, SearchIcon, SparklesIcon, StarIcon, TvIcon } from "@/components/icons";
import { TitleGrid } from "@/components/title-grid";
import { Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Discover() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const type = (params.get("type") === "tv" ? "tv" : "movie") as MediaType;
  const [q, setQ] = useState(params.get("q") ?? "");
  const query = useDebounced(q.trim());

  useEffect(() => {
    const next = new URLSearchParams({ type, ...(query ? { q: query } : {}) });
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [query, type, router, pathname]);

  const results = useQuery({
    queryKey: query ? ["search", type, query] : ["trending", type],
    queryFn: () => (query ? api.catalog.search(type, query) : api.catalog.trending(type)),
    placeholderData: keepPreviousData,
    staleTime: query ? 5 * 60_000 : 60_000,
  });

  const topRated = useQuery({
    queryKey: ["top-rated", type],
    queryFn: () => api.catalog.topRated(type),
    enabled: !query,
    staleTime: 60_000,
  });

  const setType = (t: MediaType) => {
    const next = new URLSearchParams({ type: t, ...(query ? { q: query } : {}) });
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <>
      <PageHeader
        title="Discover"
        subtitle="Find something you watched and rank it."
        action={
          <Link href={`/picks?type=${type}`} className="btn-ghost">
            <SparklesIcon size={16} className="text-brand" /> Picks by genre
          </Link>
        }
      />
      <DemoCatalogNote />
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" size={18} />
        <input
          autoFocus
          className="input py-3 pl-10 text-base"
          placeholder={type === "movie" ? "Search movies…" : "Search TV shows…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button className={`chip px-4 py-1.5 text-sm ${type === "movie" ? "chip-active" : ""}`} onClick={() => setType("movie")}>
          <FilmIcon size={16} /> Movies
        </button>
        <button className={`chip px-4 py-1.5 text-sm ${type === "tv" ? "chip-active" : ""}`} onClick={() => setType("tv")}>
          <TvIcon size={16} /> TV Shows
        </button>
      </div>

      <div className="mt-8 mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
          {query ? (
            `Results for “${query}”`
          ) : (
            <>
              <FlameIcon size={16} className="text-brand" /> Trending this week
            </>
          )}
        </h2>
        {!query && <p className="mt-1 text-xs text-muted">What Encore members are watching right now, weighted by how highly they rate it.</p>}
      </div>
      <ErrorNote error={results.error} />
      {results.isLoading ? (
        <Spinner />
      ) : results.data?.results.length ? (
        <TitleGrid items={results.data.results} show={query ? "none" : "trending"} />
      ) : (
        <Empty title="Nothing found">Try a different spelling or switch between Movies and TV.</Empty>
      )}

      {!query && topRated.data && topRated.data.results.length > 0 && (
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
            <StarIcon size={16} className="text-brand" /> Highest rated on Encore
          </h2>
          <p className="mt-1 mb-3 text-xs text-muted">Community scores, weighted so titles need several ratings to rank.</p>
          <TitleGrid items={topRated.data.results} show="rating" />
        </section>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Discover />
    </Suspense>
  );
}
