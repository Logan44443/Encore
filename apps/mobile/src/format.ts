import { ApiError, MEDIA_TYPES, type LiveShow, type MediaType, type TitleSummary, type Venue } from "@encore/shared";

/** A media type from a route param, defaulting to movies. */
export function parseMediaType(value: string | undefined): MediaType {
  return MEDIA_TYPES.find((t) => t === value) ?? "movie";
}

/** "Read" for books, "Watched" for everything else. */
export const doneVerb = (mediaType: MediaType) => (mediaType === "book" ? "Read" : "Watched");

/** The line under a title's name: the author for books, otherwise the year. */
export function titleByline(title: Pick<TitleSummary, "mediaType" | "year" | "author">): string {
  if (title.mediaType === "book") return [title.author, title.year].filter(Boolean).join(" · ");
  return title.year ? String(title.year) : "";
}

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

/** The photo that stands for a show: the headliner's, else the first act on the bill who has one. */
export function showPhoto(show: LiveShow): { uri: string | null; name: string } {
  const lead = show.lineup.find((s) => s.role === "headliner") ?? show.lineup[0];
  const pictured = lead?.performer.imageUrl ? lead : show.lineup.find((s) => s.performer.imageUrl);
  return { uri: pictured?.performer.imageUrl ?? null, name: pictured?.performer.name ?? showTitle(show) };
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

/** A Date's calendar day in the phone's time zone as YYYY-MM-DD (toISOString would give the UTC date). */
export function toLocalIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today's date in the phone's time zone as YYYY-MM-DD. */
export function localToday() {
  return toLocalIsoDate(new Date());
}

/** Local midnight on a YYYY-MM-DD day (new Date("YYYY-MM-DD") would parse it as UTC). */
export function fromLocalIsoDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
