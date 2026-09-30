"use client";

import type { MediaType } from "@encore/shared";
import type { MouseEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useToggleTitle } from "@/lib/watchlist";
import { BookmarkIcon } from "./icons";

/** Full-size toggle for title pages. */
export function WatchlistButton({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const { saved, pending, toggle } = useToggleTitle(mediaType, tmdbId);
  return (
    <button className={saved ? "btn-ghost border-brand/50 text-brand" : "btn-ghost"} disabled={pending} onClick={toggle}>
      <BookmarkIcon size={16} filled={saved} /> {saved ? "On your watchlist" : "Add to watchlist"}
    </button>
  );
}

/** Compact overlay for poster grids; hidden when signed out. */
export function PosterBookmark({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const { user, ready } = useAuth();
  const { saved, pending, toggle } = useToggleTitle(mediaType, tmdbId);
  if (!ready || !user) return null;
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  };
  return (
    <button
      onClick={onClick}
      disabled={pending}
      aria-label={saved ? "Remove from watchlist" : "Add to watchlist"}
      title={saved ? "On your watchlist" : "Add to watchlist"}
      className={`absolute top-1.5 right-1.5 rounded-full bg-ink/85 p-1.5 backdrop-blur transition ${
        saved ? "text-brand" : "text-white/80 opacity-100 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
      }`}
    >
      <BookmarkIcon size={14} filled={saved} />
    </button>
  );
}
