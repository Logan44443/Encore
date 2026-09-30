"use client";

import type { MediaType } from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { EntryDetailsForm, type EntryDetails } from "@/components/entry-details-form";
import { formatEpisode } from "@/components/episode-picker";
import { Poster } from "@/components/poster";
import { RankFlow } from "@/components/rank-flow";
import { ScoreBadge } from "@/components/score-badge";
import { ErrorNote, Spinner } from "@/components/ui";
import { WatchlistButton } from "@/components/watchlist-button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function TitlePage() {
  const params = useParams<{ type: string; id: string }>();
  const type = params.type as MediaType;
  const tmdbId = Number(params.id);
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ranking, setRanking] = useState(false);
  const [editing, setEditing] = useState<EntryDetails | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["title", type, tmdbId, user?.id],
    queryFn: () => api.catalog.title(type, tmdbId),
  });

  const saveDetails = useMutation({
    mutationFn: (d: EntryDetails) =>
      api.entries.update(data!.myEntry!.id, {
        review: d.review.trim() || null,
        watchedAt: d.watchedAt || null,
        favoriteEpisode: d.favoriteEpisode,
        leastFavoriteEpisode: d.leastFavoriteEpisode,
      }),
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["title", type, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.entries.remove(data!.myEntry!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["title", type, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorNote error={error ?? new Error("Not found")} />;
  const { title, myEntry } = data;

  const startRank = () => (user ? setRanking(true) : router.push(`/login?next=/title/${type}/${tmdbId}`));

  return (
    <div>
      {title.backdropUrl && (
        <div className="relative -mx-4 -mt-6 mb-[-6rem] h-64 overflow-hidden sm:-mx-6 sm:h-80">
          <Image src={title.backdropUrl} alt="" fill priority sizes="100vw" className="object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
        </div>
      )}

      <div className="relative flex flex-col gap-6 sm:flex-row">
        <Poster src={title.posterUrl} name={title.name} className="w-40 shrink-0 shadow-2xl sm:w-56" sizes="224px" priority />
        <div className="min-w-0 flex-1 pt-2">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{type === "movie" ? "Movie" : "TV Series"}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
            {title.name} {title.year && <span className="font-medium text-muted">({title.year})</span>}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {title.genres.map((g) => (
              <Link key={g.id} href={`/picks?type=${type}&genre=${g.id}`} className="chip" title={`Best ${g.name} picks`}>
                {g.name}
              </Link>
            ))}
            {type === "tv" && title.seasons.length > 0 && (
              <span className="chip cursor-default">
                {title.seasons.filter((s) => s.seasonNumber > 0).length} seasons
              </span>
            )}
          </div>
          <p className="mt-4 max-w-2xl leading-relaxed text-zinc-300">{title.overview}</p>

          {!myEntry && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={startRank}>
                Rank this {type === "movie" ? "movie" : "show"}
              </button>
              {user && <WatchlistButton mediaType={type} tmdbId={tmdbId} />}
            </div>
          )}
        </div>
      </div>

      {myEntry && (
        <section className="card mt-8 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <ScoreBadge score={myEntry.score} tier={myEntry.tier} size="lg" />
            <div className="flex-1">
              <p className="text-sm text-muted">Your score</p>
              <p className="text-lg font-bold">
                in {myEntry.genreName}
                {myEntry.watchedAt && <span className="ml-2 text-sm font-normal text-muted">· watched {myEntry.watchedAt}</span>}
              </p>
              <Link href={`/lists?type=${type}&genre=${myEntry.genreId}`} className="text-sm text-brand">
                See your {myEntry.genreName} ranking →
              </Link>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setRanking(true)}>Re-rank</button>
              <button
                className="btn-ghost"
                onClick={() =>
                  setEditing({
                    review: myEntry.review ?? "",
                    watchedAt: myEntry.watchedAt ?? "",
                    favoriteEpisode: myEntry.favoriteEpisode,
                    leastFavoriteEpisode: myEntry.leastFavoriteEpisode,
                  })
                }
              >
                Edit
              </button>
            </div>
          </div>

          {editing ? (
            <div className="mt-6 border-t border-line pt-6">
              <EntryDetailsForm title={title} value={editing} onChange={setEditing} />
              <ErrorNote error={saveDetails.error} />
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={saveDetails.isPending} onClick={() => saveDetails.mutate(editing)}>
                  Save
                </button>
                <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                <button
                  className="btn ml-auto text-disliked hover:bg-disliked/10"
                  disabled={remove.isPending}
                  onClick={() => confirm("Remove this from your rankings?") && remove.mutate()}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-3 text-sm">
              {myEntry.review && <p className="leading-relaxed text-zinc-300">“{myEntry.review}”</p>}
              {myEntry.favoriteEpisode && (
                <p><span className="text-liked">Favorite episode:</span> {formatEpisode(myEntry.favoriteEpisode)}</p>
              )}
              {myEntry.leastFavoriteEpisode && (
                <p><span className="text-disliked">Least favorite:</span> {formatEpisode(myEntry.leastFavoriteEpisode)}</p>
              )}
            </div>
          )}
        </section>
      )}

      {ranking && <RankFlow title={title} existing={myEntry} onClose={() => setRanking(false)} />}
    </div>
  );
}
