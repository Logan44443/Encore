import { ApiError, type LiveShow, type Venue } from "@encore/shared";

export function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatPlace(venue: Venue | null) {
  if (!venue) return null;
  return [venue.city, venue.region && venue.region !== venue.city ? venue.region : null, venue.country].filter(Boolean).join(", ");
}

export function mapUrl(venue: Venue) {
  const q =
    venue.lat !== null && venue.lng !== null
      ? `${venue.lat},${venue.lng}`
      : [venue.name, venue.city, venue.country].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

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

export function formatEpisode(ep: { season: number; episode: number; name: string }) {
  return `S${ep.season}E${ep.episode}${ep.name ? ` · ${ep.name}` : ""}`;
}

export function daysUntil(iso: string) {
  const ms = new Date(`${iso}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime();
  return Math.round(ms / 86_400_000);
}
