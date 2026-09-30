import { SHOW_KIND_LABELS, type LiveShow, type Performer, type Venue } from "@encore/shared";
import Image from "next/image";
import Link from "next/link";
import { MapPinIcon } from "./icons";

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts);
}

export function formatPlace(venue: Venue | null) {
  if (!venue) return null;
  return [venue.city, venue.region && venue.region !== venue.city ? venue.region : null, venue.country].filter(Boolean).join(", ");
}

export function mapUrl(venue: Venue) {
  const q = venue.lat !== null && venue.lng !== null ? `${venue.lat},${venue.lng}` : [venue.name, venue.city, venue.country].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Display title: festival/production name, else the headliner(s). */
export function showTitle(show: LiveShow) {
  if (show.name) return show.name;
  const headliners = show.lineup.filter((s) => s.role === "headliner").map((s) => s.performer.name);
  return (headliners.length ? headliners : show.lineup.slice(0, 1).map((s) => s.performer.name)).join(" & ") || "Live show";
}

export function supportLine(show: LiveShow) {
  const others = show.name ? show.lineup : show.lineup.filter((s) => s.role !== "headliner");
  if (others.length === 0) return null;
  const names = others.slice(0, 3).map((s) => s.performer.name);
  const more = others.length - names.length;
  return `${show.name ? "" : "with "}${names.join(", ")}${more > 0 ? ` +${more} more` : ""}`;
}

export function PerformerPhoto({ performer, size = 56, className = "" }: { performer: Performer | undefined; size?: number; className?: string }) {
  const name = performer?.name ?? "?";
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand/30 to-brand-2/30 ${className}`}
      style={size > 0 ? { width: size, height: size } : undefined}
    >
      {performer?.imageUrl ? (
        <Image src={performer.imageUrl} alt={name} fill sizes={`${size * 2}px`} className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-black text-white/80" style={{ fontSize: size * 0.4 }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function LiveShowCard({ show }: { show: LiveShow }) {
  const headliner = show.lineup.find((s) => s.role === "headliner") ?? show.lineup[0];
  const place = formatPlace(show.venue);
  const support = supportLine(show);
  return (
    <Link href={`/live/${show.id}`} className="card group flex gap-4 p-3 transition hover:border-zinc-600">
      <PerformerPhoto performer={headliner?.performer} size={76} />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
          <span>{formatDate(show.date)}</span>
          <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] text-zinc-300">{SHOW_KIND_LABELS[show.kind]}</span>
        </div>
        <p className="mt-0.5 truncate text-base font-bold">{showTitle(show)}</p>
        {support && <p className="truncate text-xs text-zinc-400">{support}</p>}
        {show.venue && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted">
            <MapPinIcon size={13} className="shrink-0 text-brand" />
            <span className="truncate">
              {show.venue.name}
              {place && ` · ${place}`}
            </span>
          </p>
        )}
      </div>
      {show.rating !== null && (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full border-2 border-brand/50 text-sm font-bold text-brand">
          {show.rating.toFixed(1)}
        </div>
      )}
    </Link>
  );
}
