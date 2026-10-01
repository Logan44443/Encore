import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { draftLabel, type CompanionDraft } from "../companions";
import { useFriends } from "../friends";
import { colors } from "../theme";
import { Avatar, Button, Muted } from "./ui";

/**
 * "Watched with": a row showing who's picked, which opens a sheet listing your
 * friends, with a box for adding anyone else by name (kept private to you).
 */
export function CompanionPicker({ value, onChange }: { value: CompanionDraft[]; onChange: (value: CompanionDraft[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>Watched with</Text>
      <Pressable onPress={() => setOpen(true)} style={styles.field} accessibilityRole="button">
        <Text style={[styles.fieldText, !value.length && { color: colors.muted }]} numberOfLines={2}>
          {value.length ? value.map(draftLabel).join(", ") : "Add friends or names"}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      {open && <PickerSheet value={value} onDone={(next) => (onChange(next), setOpen(false))} />}
    </View>
  );
}

function PickerSheet({ value, onDone }: { value: CompanionDraft[]; onDone: (value: CompanionDraft[]) => void }) {
  const insets = useSafeAreaInsets();
  const friends = useFriends();
  const [picked, setPicked] = useState(value);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const has = (userId: string) => picked.some((d) => "userId" in d && d.userId === userId);
  const toggle = (userId: string, label: string) =>
    setPicked(has(userId) ? picked.filter((d) => !("userId" in d && d.userId === userId)) : [...picked, { userId, label }]);
  const names = picked.filter((d): d is { name: string } => "name" in d);
  const addName = () => {
    const name = query.trim();
    if (!name || names.some((n) => n.name.toLowerCase() === name.toLowerCase())) return;
    setPicked([...picked, { name }]);
    setQuery("");
  };

  const list = (friends.data?.friends ?? []).filter(
    (f) => !q || f.displayName.toLowerCase().includes(q) || f.username.toLowerCase().includes(q),
  );
  const exactFriend = list.some((f) => f.displayName.toLowerCase() === q || f.username.toLowerCase() === q);

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onDone(picked)}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Watched with</Text>
          <Pressable onPress={() => onDone(picked)} hitSlop={12}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Search friends or type a name"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={addName}
          autoCorrect={false}
          returnKeyType="done"
        />
        <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {q && !exactFriend ? (
            <Pressable onPress={addName} style={styles.row}>
              <Avatar name={query.trim()} size={34} />
              <Text style={[styles.name, { flex: 1 }]}>Add “{query.trim()}”</Text>
              <Muted>Only you see this</Muted>
            </Pressable>
          ) : null}
          {names.map((n) => (
            <Pressable key={`name:${n.name}`} onPress={() => setPicked(picked.filter((d) => d !== n))} style={styles.row}>
              <Avatar name={n.name} size={34} />
              <Text style={[styles.name, { flex: 1 }]}>{n.name}</Text>
              <Text style={styles.check}>✓</Text>
            </Pressable>
          ))}
          {list.map((f) => (
            <Pressable key={f.id} onPress={() => toggle(f.id, f.displayName)} style={styles.row}>
              <Avatar name={f.displayName} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{f.displayName}</Text>
                <Text style={styles.meta}>@{f.username}</Text>
              </View>
              {has(f.id) ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          ))}
          {friends.data && !friends.data.friends.length && !q ? (
            <Muted>Add friends on Encore to tag them. You can also type anyone's name.</Muted>
          ) : null}
          <Muted>Friends you tag are asked to confirm before it shows on their profile.</Muted>
        </ScrollView>
        <Button label="Done" onPress={() => onDone(picked)} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldText: { flex: 1, color: colors.text, fontSize: 15 },
  chevron: { color: colors.muted, fontSize: 22, lineHeight: 22 },
  sheet: { flex: 1, backgroundColor: colors.ink, padding: 16, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: 20, fontWeight: "900" },
  done: { color: colors.brand, fontWeight: "800", fontSize: 16 },
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
  },
  name: { color: colors.text, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  check: { color: colors.brand, fontWeight: "900", fontSize: 18 },
});
