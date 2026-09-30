import { isValidIsoDate } from "@encore/shared";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDate, fromLocalIsoDate, localToday, toLocalIsoDate } from "../format";
import { colors } from "../theme";

/**
 * A tappable date row that opens the system calendar. The value stays a YYYY-MM-DD string
 * in the phone's time zone, with "" meaning no date.
 */
export function DateField({
  label,
  value,
  onChange,
  emptyText = "Not set",
  clearable = true,
  noFuture = false,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  /** Shown when there's no date, e.g. "Today" when blank means today. */
  emptyText?: string;
  clearable?: boolean;
  /** Stop the picker at today, for things that already happened. */
  noFuture?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());
  const insets = useSafeAreaInsets();
  const valid = isValidIsoDate(value.trim());
  const maximumDate = noFuture ? fromLocalIsoDate(localToday()) : undefined;

  const show = () => {
    const start = valid ? fromLocalIsoDate(value.trim()) : fromLocalIsoDate(localToday());
    setDraft(maximumDate && start > maximumDate ? maximumDate : start);
    setOpen(true);
  };

  // Android shows its own dialog that commits on OK; iOS keeps a draft until Done.
  const onPick = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      setOpen(false);
      if (event.type === "set" && date) onChange(toLocalIsoDate(date));
      return;
    }
    if (date) setDraft(date);
  };

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.input} onPress={show} accessibilityRole="button" accessibilityLabel={`${label ?? "Date"}: ${valid ? formatDate(value.trim()) : emptyText}`}>
        <Text style={{ color: valid ? colors.text : colors.muted, fontSize: 15 }}>{valid ? formatDate(value.trim()) : value.trim() || emptyText}</Text>
        {clearable && value.trim() ? (
          <Pressable onPress={() => onChange("")} hitSlop={10} accessibilityLabel="Clear date">
            <Text style={{ color: colors.muted, fontWeight: "700" }}>Clear</Text>
          </Pressable>
        ) : null}
      </Pressable>

      {open && Platform.OS === "android" ? <DateTimePicker value={draft} mode="date" maximumDate={maximumDate} onChange={onPick} /> : null}

      {Platform.OS !== "android" ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.bar}>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={{ color: colors.muted, fontSize: 16 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onChange(toLocalIsoDate(draft));
                  setOpen(false);
                }}
                hitSlop={10}
              >
                <Text style={{ color: colors.brand, fontSize: 16, fontWeight: "700" }}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              themeVariant="dark"
              accentColor={colors.brand}
              maximumDate={maximumDate}
              onChange={onPick}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: colors.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 12 },
  bar: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 4 },
});
