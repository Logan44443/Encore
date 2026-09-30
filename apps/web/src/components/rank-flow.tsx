"use client";

import {
  answerComparison,
  genreName,
  genresFor,
  insertionIndex,
  maxComparisons,
  nextComparisonIndex,
  startComparison,
  TIER_LABELS,
  TIERS,
  type ComparisonAnswer,
  type ComparisonState,
  type Entry,
  type EntryResult,
  type RankCandidate,
  type Tier,
  type Title,
} from "@encore/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { emptyDetails, EntryDetailsForm, type EntryDetails } from "./entry-details-form";
import { ThumbDownIcon, ThumbUpIcon, XIcon } from "./icons";
import { Poster } from "./poster";
import { ScoreBadge } from "./score-badge";
import { ErrorNote } from "./ui";

type Step = "genre" | "tier" | "compare" | "details" | "done";

const TIER_STYLE: Record<Tier, string> = {
  liked: "hover:border-liked/70 hover:bg-liked/10 text-liked",
  fine: "hover:border-fine/70 hover:bg-fine/10 text-fine",
  disliked: "hover:border-disliked/70 hover:bg-disliked/10 text-disliked",
};

/**
 * Beli-style ranking: pick a genre and a gut reaction, then answer head-to-head
 * questions against titles already in that (genre, reaction) list. The binary
 * search runs client-side; only the final slot is sent to the API.
 */
export function RankFlow({ title, existing, onClose }: { title: Title; existing?: Entry | null; onClose: () => void }) {
  const genreOptions = title.genres.length > 0 ? title.genres : genresFor(title.mediaType);
  const [step, setStep] = useState<Step>(genreOptions.length === 1 && !existing ? "tier" : "genre");
  const [genreId, setGenreId] = useState<number>(existing?.genreId ?? genreOptions[0].id);
  const [tier, setTier] = useState<Tier | null>(null);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [details, setDetails] = useState<EntryDetails>(emptyDetails);
  const [result, setResult] = useState<EntryResult | null>(null);
  const queryClient = useQueryClient();

  const candidatesQuery = useQuery({
    queryKey: ["candidates", title.mediaType, genreId, tier, existing?.id],
    queryFn: () =>
      api.entries.candidates({ mediaType: title.mediaType, genreId, tier: tier!, excludeEntryId: existing?.id }),
    enabled: step === "compare" && tier !== null,
    staleTime: 0,
    gcTime: 0,
  });
  const candidates: RankCandidate[] = candidatesQuery.data?.candidates ?? [];

  useEffect(() => {
    if (step !== "compare" || !candidatesQuery.data) return;
    const list = candidatesQuery.data.candidates;
    if (list.length === 0) {
      setCmp(startComparison(0));
      setStep(existing ? "done" : "details");
    } else if (!cmp) {
      setCmp(startComparison(list.length));
    }
  }, [step, candidatesQuery.data, cmp, existing]);

  const save = useMutation({
    mutationFn: async () => {
      const index = cmp ? insertionIndex(cmp) : 0;
      const aboveEntryId = index === 0 ? null : candidates[index - 1].entryId;
      if (existing) return api.entries.rerank(existing.id, { genreId, tier: tier!, aboveEntryId });
      return api.entries.create({
        mediaType: title.mediaType,
        tmdbId: title.tmdbId,
        genreId,
        tier: tier!,
        aboveEntryId,
        review: details.review.trim() || null,
        watchedAt: details.watchedAt || null,
        favoriteEpisode: details.favoriteEpisode,
        leastFavoriteEpisode: details.leastFavoriteEpisode,
      });
    },
    onSuccess: (res) => {
      setResult(res);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["title", title.mediaType, title.tmdbId] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["trending"] });
      queryClient.invalidateQueries({ queryKey: ["top-rated"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["genres"] });
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  // Rerank with an empty list has nothing to compare — save immediately.
  useEffect(() => {
    if (existing && step === "done" && !result && !save.isPending && !save.isError) save.mutate();
  }, [existing, step, result, save]);

  const answer = useCallback(
    (a: ComparisonAnswer) => {
      if (!cmp) return;
      const next = answerComparison(cmp, a);
      setCmp(next);
      if (nextComparisonIndex(next) === null) {
        if (existing) setStep("done");
        else setStep("details");
      }
    },
    [cmp, existing],
  );

  useEffect(() => {
    if (step !== "compare") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") answer("new");
      if (e.key === "ArrowRight") answer("existing");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, answer]);

  const opponentIdx = cmp ? nextComparisonIndex(cmp) : null;
  const opponent = opponentIdx !== null ? candidates[opponentIdx] : null;
  const genre = genreName(title.mediaType, genreId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="card relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-b-none p-6 sm:rounded-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-white" aria-label="Close">
          <XIcon />
        </button>
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {existing ? "Re-rank" : "Rank"} · {title.name}
        </p>

        {step === "genre" && (
          <section className="mt-4">
            <h2 className="text-xl font-bold">Which genre should it compete in?</h2>
            <p className="mt-1 text-sm text-muted">It&apos;ll only be compared against your other {genre.toLowerCase()} picks.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {genreOptions.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGenreId(g.id)}
                  className={`chip px-4 py-2 text-sm ${g.id === genreId ? "chip-active" : ""}`}
                >
                  {g.name}
                </button>
              ))}
            </div>
            <button className="btn-primary mt-6 w-full" onClick={() => setStep("tier")}>
              Continue
            </button>
          </section>
        )}

        {step === "tier" && (
          <section className="mt-4">
            <h2 className="text-xl font-bold">How was it?</h2>
            <p className="mt-1 text-sm text-muted">Your gut reaction — we&apos;ll fine-tune it next.</p>
            <div className="mt-5 grid gap-3">
              {TIERS.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTier(t);
                    setCmp(null);
                    setStep("compare");
                  }}
                  className={`flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-4 py-4 text-left font-semibold transition ${TIER_STYLE[t]}`}
                >
                  {t === "liked" ? <ThumbUpIcon /> : t === "disliked" ? <ThumbDownIcon /> : <span className="w-5 text-center">~</span>}
                  <span className="text-zinc-100">{TIER_LABELS[t]}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === "compare" && (
          <section className="mt-4">
            <h2 className="text-xl font-bold">Which did you like more?</h2>
            <p className="mt-1 text-sm text-muted">
              {cmp && candidates.length > 0
                ? `Question ${cmp.asked + 1} of at most ${maxComparisons(candidates.length)} · ${genre}`
                : "Loading your list…"}
            </p>
            <ErrorNote error={candidatesQuery.error} />
            {opponent && (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <CompareCard name={title.name} year={title.year} posterUrl={title.posterUrl} onPick={() => answer("new")} highlight />
                  <CompareCard
                    name={opponent.title.name}
                    year={opponent.title.year}
                    posterUrl={opponent.title.posterUrl}
                    onPick={() => answer("existing")}
                  />
                </div>
                <button className="btn-ghost mt-4 w-full" onClick={() => answer("tie")}>
                  Too close to call
                </button>
              </>
            )}
          </section>
        )}

        {step === "details" && (
          <section className="mt-4">
            <h2 className="text-xl font-bold">Anything to add?</h2>
            <p className="mt-1 mb-5 text-sm text-muted">Optional — you can edit this later.</p>
            <EntryDetailsForm title={title} value={details} onChange={setDetails} />
            <ErrorNote error={save.error} />
            <button className="btn-primary mt-6 w-full" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save ranking"}
            </button>
          </section>
        )}

        {step === "done" && (
          <section className="mt-6 flex flex-col items-center text-center">
            {result ? (
              <>
                <ScoreBadge score={result.entry.score} tier={result.entry.tier} size="lg" />
                <h2 className="mt-4 text-xl font-bold">
                  #{result.rank} of {result.outOf} in {result.entry.genreName}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {title.name} scored {result.entry.score.toFixed(1)} / 10
                </p>
                <button className="btn-primary mt-6 w-full" onClick={onClose}>
                  Done
                </button>
              </>
            ) : (
              <>
                <ErrorNote error={save.error} />
                {save.isError ? (
                  <button className="btn-ghost mt-4" onClick={() => { setCmp(null); setStep("tier"); save.reset(); }}>
                    Start over
                  </button>
                ) : (
                  <p className="text-muted">Saving…</p>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function CompareCard({
  name,
  year,
  posterUrl,
  onPick,
  highlight,
}: {
  name: string;
  year: number | null;
  posterUrl: string | null;
  onPick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onPick}
      className={`group rounded-2xl border bg-panel-2 p-2 text-left transition hover:-translate-y-0.5 hover:border-brand ${
        highlight ? "border-brand/40" : "border-line"
      }`}
    >
      <Poster src={posterUrl} name={name} sizes="240px" />
      <p className="mt-2 line-clamp-2 px-1 text-sm font-semibold">{name}</p>
      {year && <p className="px-1 pb-1 text-xs text-muted">{year}</p>}
    </button>
  );
}
