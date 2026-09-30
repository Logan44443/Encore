"use client";

import type { MediaType } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DemoCatalogNote } from "@/components/demo-catalog-note";
import { EntryRow } from "@/components/entry-row";
import { FilmIcon, SparklesIcon, StarIcon, TvIcon, UserIcon } from "@/components/icons";
import { TitleGrid } from "@/components/title-grid";
import { Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function Section({ icon, title, subtitle, children }: { icon: ReactNode; title: ReactNode; subtitle?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {icon} {title}
      </h2>
      {subtitle && <p className="mt-0.5 mb-3 text-xs text-muted">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Picks() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const type = (params.get("type") === "tv" ? "tv" : "movie") as MediaType;

  const genres = useQuery({
    queryKey: ["genres", type, user?.id],
    queryFn: () => api.catalog.genres(type),
  });
  const genreParam = Number(params.get("genre"));
  const genreId = genres.data?.genres.some((g) => g.id === genreParam) ? genreParam : genres.data?.genres[0]?.id;

  const recs = useQuery({
    queryKey: ["recommendations", type, genreId, user?.id],
    queryFn: () => api.catalog.recommendations(type, genreId!),
    enabled: genreId !== undefined,
  });

  const go = (next: { type?: MediaType; genre?: number }) => {
    const qs = new URLSearchParams({ type: next.type ?? type });
    if (next.genre !== undefined) qs.set("genre", String(next.genre));
    router.replace(`${pathname}?${qs}`, { scroll: false });
  };

  const noun = type === "movie" ? "movies" : "shows";
  const r = recs.data;
  const genreName = r?.genre.name ?? "";
  const hasCritic = r?.acclaimed.some((t) => t.voteAverage !== null);

  return (
    <>
      <PageHeader title="Picks" subtitle={`The best ${noun} in every genre, based on what rates highest.`} />
      <DemoCatalogNote />

      <div className="flex gap-2">
        <button className={`chip px-4 py-1.5 text-sm ${type === "movie" ? "chip-active" : ""}`} onClick={() => go({ type: "movie" })}>
          <FilmIcon size={16} /> Movies
        </button>
        <button className={`chip px-4 py-1.5 text-sm ${type === "tv" ? "chip-active" : ""}`} onClick={() => go({ type: "tv" })}>
          <TvIcon size={16} /> TV Shows
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {genres.data?.genres.map((g) => (
          <button key={g.id} className={`chip ${g.id === genreId ? "chip-active" : ""}`} onClick={() => go({ genre: g.id })}>
            {g.name}
            {g.yourCount > 0 && <span className="text-muted">{g.yourCount}</span>}
          </button>
        ))}
      </div>

      <ErrorNote error={genres.error ?? recs.error} />
      {recs.isLoading || genres.isLoading ? (
        <Spinner />
      ) : r ? (
        <div className="mt-10 space-y-12">
          <Section
            icon={<StarIcon size={18} className="text-brand" />}
            title={`Encore's favorite ${genreName.toLowerCase()} ${noun}`}
            subtitle="Highest community scores, weighted so a title needs several ratings to rank. Titles you've ranked are hidden."
          >
            {r.community.length ? (
              <TitleGrid items={r.community} show="rating" />
            ) : (
              <Empty title={`No community ratings in ${genreName} yet`}>Rank a few and they&apos;ll start showing up here for everyone.</Empty>
            )}
          </Section>

          {r.becauseYouLoved && (
            <Section
              icon={<SparklesIcon size={18} className="text-brand" />}
              title={
                <>
                  Because you loved{" "}
                  <Link href={`/title/${type}/${r.becauseYouLoved.title.tmdbId}`} className="text-gradient">
                    {r.becauseYouLoved.title.name}
                  </Link>
                </>
              }
              subtitle={`Your top ${genreName.toLowerCase()} pick (${r.becauseYouLoved.score.toFixed(1)}). Here's what fans of it watch next.`}
            >
              <TitleGrid items={r.becauseYouLoved.results} show="none" />
            </Section>
          )}

          <Section
            icon={<StarIcon size={18} className="text-fine" />}
            title={hasCritic ? "Critically acclaimed" : `${genreName} essentials`}
            subtitle={hasCritic ? "Top-reviewed on TMDB with a high minimum number of votes." : undefined}
          >
            {r.acclaimed.length ? <TitleGrid items={r.acclaimed} show="critic" /> : <Empty title="You've ranked them all!" />}
          </Section>

          {r.yourTop.length > 0 && (
            <Section icon={<UserIcon size={18} className="text-brand" />} title={`Your top ${genreName.toLowerCase()}`}>
              <div className="space-y-2">
                {r.yourTop.map((e, i) => (
                  <EntryRow key={e.id} entry={e} rank={i + 1} />
                ))}
              </div>
              <Link href={`/lists?type=${type}&genre=${r.genre.id}`} className="mt-3 inline-block text-sm text-brand">
                See your full {genreName} ranking →
              </Link>
            </Section>
          )}
        </div>
      ) : null}
    </>
  );
}

export default function PicksPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Picks />
    </Suspense>
  );
}
