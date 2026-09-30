"use client";

import type { EpisodeRef, Title } from "@encore/shared";
import { EpisodePicker } from "./episode-picker";

export interface EntryDetails {
  review: string;
  watchedAt: string;
  favoriteEpisode: EpisodeRef | null;
  leastFavoriteEpisode: EpisodeRef | null;
}

export const emptyDetails = (): EntryDetails => ({
  review: "",
  watchedAt: new Date().toISOString().slice(0, 10),
  favoriteEpisode: null,
  leastFavoriteEpisode: null,
});

export function EntryDetailsForm({
  title,
  value,
  onChange,
}: {
  title: Title;
  value: EntryDetails;
  onChange: (v: EntryDetails) => void;
}) {
  const set = <K extends keyof EntryDetails>(k: K, v: EntryDetails[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="review">
          Your thoughts
        </label>
        <textarea
          id="review"
          className="input min-h-28 resize-y"
          placeholder="What stood out? What didn't work?"
          value={value.review}
          onChange={(e) => set("review", e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="watched">
          Watched on
        </label>
        <input
          id="watched"
          type="date"
          className="input w-48"
          value={value.watchedAt}
          onChange={(e) => set("watchedAt", e.target.value)}
        />
      </div>
      {title.mediaType === "tv" && title.seasons.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <EpisodePicker
            label="Favorite episode"
            tmdbId={title.tmdbId}
            seasons={title.seasons}
            value={value.favoriteEpisode}
            onChange={(v) => set("favoriteEpisode", v)}
          />
          <EpisodePicker
            label="Least favorite episode"
            tmdbId={title.tmdbId}
            seasons={title.seasons}
            value={value.leastFavoriteEpisode}
            onChange={(v) => set("leastFavoriteEpisode", v)}
          />
        </div>
      )}
    </div>
  );
}
