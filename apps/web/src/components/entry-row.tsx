import type { Entry } from "@encore/shared";
import Link from "next/link";
import { Poster } from "./poster";
import { ScoreBadge } from "./score-badge";

export function EntryRow({ entry, rank }: { entry: Entry; rank?: number }) {
  const { title } = entry;
  return (
    <Link
      href={`/title/${title.mediaType}/${title.tmdbId}`}
      className="card flex items-center gap-4 p-3 transition hover:border-zinc-600"
    >
      {rank !== undefined && <span className="w-6 text-center text-sm font-bold text-muted">{rank}</span>}
      <Poster src={title.posterUrl} name={title.name} className="w-12 shrink-0 rounded-lg" sizes="48px" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title.name}</p>
        <p className="text-xs text-muted">
          {[title.year, entry.genreName].filter(Boolean).join(" · ")}
        </p>
        {entry.review && <p className="mt-1 line-clamp-1 text-sm text-zinc-400">“{entry.review}”</p>}
      </div>
      <ScoreBadge score={entry.score} tier={entry.tier} />
    </Link>
  );
}
