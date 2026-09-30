import {
  isValidIsoDate,
  SHOW_KINDS,
  type CreateLiveShowInput,
  type LiveShow,
  type Performer,
  type PerformerRole,
  type ShowKind,
  type SongReaction,
} from "@encore/shared";
import { localToday } from "./format";

export interface SongDraft {
  title: string;
  encore: boolean;
  reaction: SongReaction | null;
  note: string;
}

export interface SlotDraft {
  performer: Performer;
  role: PerformerRole;
  songs: SongDraft[];
}

export interface LiveShowFormValues {
  kind: ShowKind | null;
  name: string;
  date: string;
  venueName: string;
  city: string;
  region: string;
  country: string;
  lat: number | null;
  lng: number | null;
  setlistFmVenueId: string | null;
  tourName: string;
  setlistFmId: string | null;
  rating: number | null;
  liked: string;
  disliked: string;
  notes: string;
  lineup: SlotDraft[];
}

const NAMED: Partial<Record<ShowKind, string>> = {
  festival: "Festival name",
  theatre: "Production",
  comedy: "Show / special name",
  other: "Event name",
};

export const SHOW_KIND_EMOJI: Record<ShowKind, string> = {
  concert: "🎤",
  festival: "🎪",
  dj_set: "🎛️",
  theatre: "🎭",
  comedy: "😂",
  other: "🎟️",
};

export function nameLabel(kind: ShowKind | null) {
  return kind ? (NAMED[kind] ?? null) : null;
}

export type LiveFormErrors = Partial<Record<"kind" | "lineup" | "rating" | "date", string>>;

export function validateLiveForm(v: LiveShowFormValues): LiveFormErrors {
  const errors: LiveFormErrors = {};
  if (!v.kind) errors.kind = "Pick what kind of show it was";
  if (v.lineup.length === 0) errors.lineup = "Add at least one performer";
  if (v.rating === null) errors.rating = "Slide to rate the show";
  if (v.date.trim() && !isValidIsoDate(v.date.trim())) errors.date = "That date isn't valid. Pick one from the calendar, or clear it for today";
  return errors;
}

export function showToForm(s?: LiveShow): LiveShowFormValues {
  return {
    kind: s?.kind ?? null,
    name: s?.name ?? "",
    date: s?.date ?? "",
    venueName: s?.venue?.name ?? "",
    city: s?.venue?.city ?? "",
    region: s?.venue?.region ?? "",
    country: s?.venue?.country ?? "",
    lat: s?.venue?.lat ?? null,
    lng: s?.venue?.lng ?? null,
    setlistFmVenueId: null,
    tourName: s?.tourName ?? "",
    setlistFmId: s?.setlistFmId ?? null,
    rating: s?.rating ?? null,
    liked: s?.liked ?? "",
    disliked: s?.disliked ?? "",
    notes: s?.notes ?? "",
    lineup: (s?.lineup ?? []).map((slot) => ({
      performer: slot.performer,
      role: slot.role,
      songs: slot.songs.map((x) => ({ title: x.title, encore: x.encore, reaction: x.reaction, note: x.note ?? "" })),
    })),
  };
}

export function formToPayload(v: LiveShowFormValues): CreateLiveShowInput {
  const text = (s: string) => s.trim() || null;
  return {
    kind: v.kind ?? "other",
    name: nameLabel(v.kind) ? text(v.name) : null,
    date: v.date.trim() || localToday(),
    venue: v.venueName.trim()
      ? {
          name: v.venueName.trim(),
          city: text(v.city),
          region: text(v.region),
          country: text(v.country),
          lat: v.lat,
          lng: v.lng,
          setlistFmId: v.setlistFmVenueId,
        }
      : null,
    tourName: text(v.tourName),
    setlistFmId: v.setlistFmId,
    rating: v.rating,
    liked: text(v.liked),
    disliked: text(v.disliked),
    notes: text(v.notes),
    lineup: v.lineup.map((slot) => ({
      role: slot.role,
      performer: slot.performer,
      songs: slot.songs.map((s) => ({ title: s.title, encore: s.encore, reaction: s.reaction, note: text(s.note) })),
    })),
  };
}

export const SHOW_KIND_OPTIONS = SHOW_KINDS;
