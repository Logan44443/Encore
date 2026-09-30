"use client";

import type { EpisodeRef, SeasonSummary } from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";

export function EpisodePicker({
  label,
  tmdbId,
  seasons,
  value,
  onChange,
}: {
  label: string;
  tmdbId: number;
  seasons: SeasonSummary[];
  value: EpisodeRef | null | undefined;
  onChange: (value: EpisodeRef | null) => void;
}) {
  const [season, setSeason] = useState<number | null>(value?.season ?? null);
  const { data, isFetching } = useQuery({
    queryKey: ["season", tmdbId, season],
    queryFn: () => api.catalog.season(tmdbId, season!),
    enabled: season !== null,
    staleTime: Infinity,
  });

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <select
          className="input w-36 shrink-0"
          value={season ?? ""}
          onChange={(e) => {
            setSeason(e.target.value === "" ? null : Number(e.target.value));
            onChange(null);
          }}
        >
          <option value="">Season…</option>
          {seasons.map((s) => (
            <option key={s.seasonNumber} value={s.seasonNumber}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="input min-w-0"
          disabled={season === null || isFetching}
          value={value && value.season === season ? value.episode : ""}
          onChange={(e) => {
            const ep = data?.episodes.find((x) => x.episode === Number(e.target.value));
            onChange(ep ? { season: ep.season, episode: ep.episode, name: ep.name } : null);
          }}
        >
          <option value="">{isFetching ? "Loading…" : "Episode…"}</option>
          {data?.episodes.map((ep) => (
            <option key={ep.episode} value={ep.episode}>
              E{ep.episode} · {ep.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function formatEpisode(ep: EpisodeRef) {
  return `S${ep.season} E${ep.episode} · ${ep.name}`;
}
