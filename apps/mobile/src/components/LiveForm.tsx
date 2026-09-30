import {
  isValidIsoDate,
  PERFORMER_ROLES,
  SHOW_KIND_LABELS,
  type Performer,
  type PerformerRole,
  type SetlistSummary,
  type SongReaction,
} from "@encore/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { formatDate } from "../format";
import {
  SHOW_KIND_EMOJI,
  nameLabel,
  validateLiveForm,
  type LiveShowFormValues,
  type SlotDraft,
  type SongDraft,
} from "../live-form";
import { colors } from "../theme";
import { DateField } from "./DateField";
import { RatingSlider } from "./RatingSlider";
import { Button, Chip, ErrorText, Field } from "./ui";

const ROLE_LABEL: Record<PerformerRole, string> = { headliner: "Headliner", support: "Support", guest: "Guest" };
const REACTIONS: { value: SongReaction; label: string }[] = [
  { value: "loved", label: "Loved" },
  { value: "liked", label: "Liked" },
  { value: "disliked", label: "Nope" },
];

export function LiveForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onInvalid,
}: {
  initial: LiveShowFormValues;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (v: LiveShowFormValues) => void;
  onInvalid?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [active, setActive] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateLiveForm(v) : {};

  const submit = () => {
    setAttempted(true);
    if (Object.keys(validateLiveForm(v)).length > 0) {
      onInvalid?.();
      return;
    }
    onSubmit(v);
  };
  const set = <K extends keyof LiveShowFormValues>(k: K, val: LiveShowFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const slot = v.lineup[active];

  const setLineup = (lineup: SlotDraft[]) => {
    setV((p) => ({ ...p, lineup }));
    setActive((i) => Math.min(i, Math.max(0, lineup.length - 1)));
  };

  const addPerformer = (performer: Performer) => {
    if (v.lineup.some((s) => (performer.mbid ? s.performer.mbid === performer.mbid : s.performer.name === performer.name))) return;
    setLineup([...v.lineup, { performer, role: v.lineup.length === 0 ? "headliner" : "support", songs: [] }]);
  };

  const applySetlist = (slotIndex: number, s: SetlistSummary) => {
    setV((p) => ({
      ...p,
      date: s.eventDate,
      venueName: s.venue?.name ?? p.venueName,
      city: s.venue?.city ?? p.city,
      region: s.venue?.region ?? p.region,
      country: s.venue?.country ?? p.country,
      lat: s.venue?.lat ?? null,
      lng: s.venue?.lng ?? null,
      setlistFmVenueId: s.venue?.setlistFmId ?? null,
      tourName: s.tourName ?? p.tourName,
      setlistFmId: slotIndex === 0 ? s.id : p.setlistFmId,
      lineup: p.lineup.map((item, i) =>
        i === slotIndex ? { ...item, songs: s.songs.map((song) => ({ ...song, reaction: null, note: "" })) } : item,
      ),
    }));
  };

  const named = nameLabel(v.kind);

  return (
    <View style={{ gap: 18 }}>
      {attempted && Object.keys(errors).length > 0 && (
        <View style={styles.banner}>
          <Text style={{ color: colors.disliked, fontWeight: "700" }}>Fill in the fields marked in red to save.</Text>
        </View>
      )}

      <View style={[styles.section, errors.kind && styles.sectionError]}>
        <Required label="What kind of show?" invalid={!!errors.kind} />
        <View style={styles.wrap}>
          {(Object.keys(SHOW_KIND_LABELS) as (keyof typeof SHOW_KIND_LABELS)[]).map((k) => (
            <Chip key={k} label={`${SHOW_KIND_EMOJI[k]}  ${SHOW_KIND_LABELS[k]}`} active={v.kind === k} onPress={() => set("kind", k)} />
          ))}
        </View>
        {errors.kind && <Text style={styles.errorText}>{errors.kind}</Text>}
        {named && <Field label={named} value={v.name} onChangeText={(name) => set("name", name)} />}
      </View>

      <View style={[styles.section, errors.lineup && styles.sectionError]}>
        <Required label="Who performed?" invalid={!!errors.lineup} />
        <Text style={styles.muted}>Add the headliner first, then support acts.</Text>
        {errors.lineup && <Text style={styles.errorText}>{errors.lineup}</Text>}
        {v.lineup.map((s, i) => (
          <View key={`${s.performer.mbid ?? s.performer.name}-${i}`} style={styles.slot}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{s.performer.name}</Text>
              <Text style={styles.muted}>{ROLE_LABEL[s.role]}</Text>
            </View>
            <Pressable onPress={() => setLineup(v.lineup.map((x, j) => (j === i ? { ...x, role: nextRole(x.role) } : x)))}>
              <Text style={styles.link}>Role</Text>
            </Pressable>
            <Pressable onPress={() => setLineup(swap(v.lineup, i, i - 1))}>
              <Text style={styles.link}>Up</Text>
            </Pressable>
            <Pressable onPress={() => setLineup(v.lineup.filter((_, j) => j !== i))}>
              <Text style={{ color: colors.disliked, fontWeight: "700" }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <PerformerSearch onSelect={addPerformer} />
      </View>

      <View style={[styles.section, errors.rating && styles.sectionError]}>
        <Required label="How was it?" invalid={!!errors.rating} />
        <RatingSlider value={v.rating} onChange={(rating) => set("rating", rating)} invalid={!!errors.rating} />
        {errors.rating && <Text style={styles.errorText}>{errors.rating}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>When and where?</Text>
        <DateField label="Date" value={v.date} onChange={(date) => set("date", date)} emptyText="Today" noFuture />
        {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
        <Field label="Venue" value={v.venueName} onChangeText={(venueName) => setV((p) => ({ ...p, venueName, lat: null, lng: null, setlistFmVenueId: null }))} />
        <Field label="City" value={v.city} onChangeText={(city) => setV((p) => ({ ...p, city, lat: null, lng: null }))} />
      </View>

      <View style={{ gap: 10 }}>
        <Text style={styles.h2}>What did they play?</Text>
        {v.lineup.length === 0 ? (
          <Text style={styles.muted}>Add a performer above first.</Text>
        ) : (
          <>
            {v.lineup.length > 1 && (
              <View style={styles.wrap}>
                {v.lineup.map((s, i) => (
                  <Chip key={i} label={`${s.performer.name} (${s.songs.length})`} active={i === active} onPress={() => setActive(i)} />
                ))}
              </View>
            )}
            {slot?.performer.mbid && (
              <SetlistImporter key={slot.performer.mbid} mbid={slot.performer.mbid} date={v.date} onPick={(s) => applySetlist(active, s)} />
            )}
            {slot && <SongEditor songs={slot.songs} onChange={(songs) => setLineup(v.lineup.map((x, j) => (j === active ? { ...x, songs } : x)))} />}
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>Your thoughts</Text>
        <Field label="What you liked" value={v.liked} onChangeText={(liked) => set("liked", liked)} multiline />
        <Field label="What you didn't like" value={v.disliked} onChangeText={(disliked) => set("disliked", disliked)} multiline />
        <Field label="Other notes" value={v.notes} onChangeText={(notes) => set("notes", notes)} multiline />
      </View>

      <ErrorText error={error} />
      <Button label={pending ? "Saving…" : submitLabel} disabled={pending} onPress={submit} />
    </View>
  );
}

function Required({ label, invalid }: { label: string; invalid: boolean }) {
  return (
    <Text style={[styles.h2, invalid && { color: colors.disliked }]}>
      {label}
      <Text style={{ color: invalid ? colors.disliked : colors.brand }}> *</Text>
    </Text>
  );
}

export function PerformerSearch({ onSelect }: { onSelect: (p: Performer) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching, error } = useQuery({
    queryKey: ["performers", debounced],
    queryFn: () => api.music.searchPerformers(debounced),
    enabled: debounced.length >= 2,
  });

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        style={styles.input}
        placeholder="Search musicians, bands, DJs, comedians…"
        placeholderTextColor={colors.muted}
        value={q}
        onChangeText={setQ}
      />
      <ErrorText error={error} />
      {isFetching && <Text style={styles.muted}>Searching…</Text>}
      {data?.performers.map((p, i) => (
        <Pressable key={p.mbid ?? `${p.name}-${i}`} onPress={() => { onSelect(p); setQ(""); setDebounced(""); }} style={styles.slot}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.muted}>{[p.type, p.country, p.disambiguation].filter(Boolean).join(" · ")}</Text>
          </View>
        </Pressable>
      ))}
      {debounced.length >= 2 && !isFetching && (
        <Button
          label={`Add “${debounced}” manually`}
          tone="ghost"
          onPress={() => {
            onSelect({ mbid: null, name: debounced, disambiguation: null, country: null, type: null, imageUrl: null });
            setQ("");
            setDebounced("");
          }}
        />
      )}
    </View>
  );
}

function SetlistImporter({ mbid, date: typed, onPick }: { mbid: string; date: string; onPick: (s: SetlistSummary) => void }) {
  const [open, setOpen] = useState(false);
  // Half-typed or impossible dates are ignored rather than sent (the server would reject them).
  const date = isValidIsoDate(typed.trim()) ? typed.trim() : "";
  const { data, isFetching, error } = useQuery({
    queryKey: ["setlists", mbid, date],
    queryFn: () => api.music.setlists(mbid, date ? { date } : {}),
    enabled: open,
  });
  if (!open) return <Button label="Find the setlist on setlist.fm" tone="ghost" onPress={() => setOpen(true)} />;
  return (
    <View style={{ gap: 8 }}>
      <ErrorText error={error} />
      {isFetching && <Text style={styles.muted}>Looking up setlists{date ? ` for ${formatDate(date)}` : ""}…</Text>}
      {data && !data.enabled && <Text style={styles.muted}>Setlist import isn't configured. Add songs manually.</Text>}
      {data?.enabled && data.setlists.length === 0 && <Text style={styles.muted}>No setlists found. Add songs manually.</Text>}
      {data?.setlists.map((s) => (
        <Pressable key={s.id} onPress={() => { onPick(s); setOpen(false); }} style={styles.slot}>
          <View>
            <Text style={styles.name}>{formatDate(s.eventDate)} · {[s.venue?.name, s.venue?.city].filter(Boolean).join(", ")}</Text>
            <Text style={styles.muted}>{s.songs.length} songs{s.tourName ? ` · ${s.tourName}` : ""}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function SongEditor({ songs, onChange }: { songs: SongDraft[]; onChange: (s: SongDraft[]) => void }) {
  const [draft, setDraft] = useState("");
  const update = (i: number, patch: Partial<SongDraft>) => onChange(songs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => {
    if (!draft.trim()) return;
    onChange([...songs, { title: draft.trim(), encore: false, reaction: null, note: "" }]);
    setDraft("");
  };
  return (
    <View style={{ gap: 8 }}>
      {songs.map((s, i) => (
        <View key={`${s.title}-${i}`} style={styles.song}>
          <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
            {i + 1}. {s.title}
            {s.encore ? " · encore" : ""}
          </Text>
          <View style={styles.wrap}>
            {REACTIONS.map((r) => (
              <Chip
                key={r.value}
                label={r.label}
                active={s.reaction === r.value}
                onPress={() => update(i, { reaction: s.reaction === r.value ? null : r.value })}
              />
            ))}
            <Chip label="E" active={s.encore} onPress={() => update(i, { encore: !s.encore })} />
            <Pressable onPress={() => onChange(songs.filter((_, j) => j !== i))}>
              <Text style={{ color: colors.disliked, fontWeight: "700" }}>✕</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Add a song…" placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} onSubmitEditing={add} />
        <Button label="Add" tone="ghost" onPress={add} />
      </View>
    </View>
  );
}

function nextRole(role: PerformerRole): PerformerRole {
  const i = PERFORMER_ROLES.indexOf(role);
  return PERFORMER_ROLES[(i + 1) % PERFORMER_ROLES.length];
}

function swap<T>(list: T[], i: number, j: number): T[] {
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const styles = StyleSheet.create({
  h2: { color: colors.text, fontSize: 18, fontWeight: "800" },
  section: { gap: 10, borderWidth: 1, borderColor: "transparent", borderRadius: 16, padding: 2 },
  sectionError: { borderColor: colors.disliked, padding: 12, backgroundColor: "rgba(239,68,68,0.06)" },
  errorText: { color: colors.disliked, fontSize: 13, fontWeight: "600" },
  banner: { borderWidth: 1, borderColor: colors.disliked, borderRadius: 12, padding: 12, backgroundColor: "rgba(239,68,68,0.08)" },
  muted: { color: colors.muted, fontSize: 13 },
  name: { color: colors.text, fontWeight: "700" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  slot: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, borderRadius: 12, padding: 10 },
  song: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, borderRadius: 12, padding: 10, gap: 8 },
  link: { color: colors.brand, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
});
