import type { DiscoverResult, SearchResult } from "@encore/shared";
import Link from "next/link";
import { FlameIcon, StarIcon } from "./icons";
import { Poster } from "./poster";
import { PosterBookmark } from "./watchlist-button";

export function TitleGrid({
  items,
  show = "none",
}: {
  items: (SearchResult | DiscoverResult)[];
  show?: "trending" | "rating" | "critic" | "none";
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {items.map((t, i) => {
        const community = "community" in t ? t.community : null;
        return (
          <Link key={`${t.mediaType}-${t.tmdbId}`} href={`/title/${t.mediaType}/${t.tmdbId}`} className="group">
            <div className="relative">
              <Poster
                src={t.posterUrl}
                name={t.name}
                sizes="(max-width: 640px) 33vw, 180px"
                priority={i < 6}
                className="transition group-hover:ring-2 group-hover:ring-brand/60"
              />
              <PosterBookmark mediaType={t.mediaType} tmdbId={t.tmdbId} />
              {show === "critic" && t.voteAverage !== null && (
                <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] font-bold backdrop-blur">
                  <StarIcon size={11} className="text-fine" /> {t.voteAverage.toFixed(1)}
                </span>
              )}
              {community && (show === "trending" || show === "rating") && (
                <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] font-bold backdrop-blur">
                  {show === "trending" ? (
                    <>
                      <FlameIcon size={11} className="text-brand" /> {community.recentLogs}
                    </>
                  ) : (
                    <>
                      <StarIcon size={11} className="text-brand" /> {community.avgScore.toFixed(1)}
                    </>
                  )}
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-1 text-sm font-medium">{t.name}</p>
            <p className="text-xs text-muted">
              {[t.year, community && `${community.avgScore.toFixed(1)} avg · ${community.totalLogs} ${community.totalLogs === 1 ? "log" : "logs"}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
