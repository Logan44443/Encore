import { ApiError } from "@encore/shared";
import { useRouter } from "expo-router";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth";
import { errorMessage } from "../format";
import { colors } from "../theme";

export function Screen({
  children,
  scroll = true,
  padded = true,
  scrollRef,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  scrollRef?: React.Ref<ScrollView>;
  refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"];
}) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = padded ? { padding: 16, paddingBottom: insets.bottom + 28, gap: 16 } : { flex: 1 };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: colors.ink }, pad]}>{children}</View>;
  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={pad}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const message = errorMessage(error);
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.muted}>{body}</Text> : null}
    </View>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.h2}>{children}</Text>
      {action}
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "ghost" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, tone === "primary" ? styles.btnPrimary : tone === "danger" ? styles.btnDanger : styles.btnGhost, disabled && styles.disabled]}
    >
      <Text style={[styles.btnLabel, tone === "ghost" && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipLabel, active && { color: colors.brand }]}>
        {label}
        {count != null ? <Text style={styles.chipCount}> {count}</Text> : null}
      </Text>
    </Pressable>
  );
}

/** A pill-shaped control for switching between a few views. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, o.value === value && styles.segmentActive]}>
          <Text style={[styles.segmentText, o.value === value && styles.segmentTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

/** A titled, grouped list of rows, as in iOS Settings. */
export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      {title ? <Text style={styles.fieldLabel}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

/** One tappable row: a label, an optional current value on the right, and a chevron. */
export function SettingsRow({
  label,
  value,
  onPress,
  tone = "default",
  last,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  tone?: "default" | "danger";
  /** Drops the divider under the final row of a group. */
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { backgroundColor: colors.panel2 }]}
    >
      <Text style={[styles.rowLabel, tone === "danger" && { color: colors.disliked }]}>{label}</Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && tone !== "danger" ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

/** A settings row with an on/off switch, and an optional explanation under the label. */
export function ToggleRow({
  label,
  detail,
  value,
  onChange,
  disabled,
  last,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {detail ? <Text style={[styles.muted, { fontSize: 12, lineHeight: 16 }]}>{detail}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.brand }} />
    </View>
  );
}

/** A person's initial in a coloured circle (there are no profile photos). */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: "white", fontSize: size * 0.44, fontWeight: "900" }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export interface MenuOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

/** An iOS action sheet (an alert elsewhere) with a Cancel button added. */
export function showMenu(title: string | undefined, options: MenuOption[]) {
  if (Platform.OS === "ios") {
    const destructive = options.flatMap((o, i) => (o.destructive ? [i] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options.map((o) => o.label), "Cancel"], cancelButtonIndex: options.length, destructiveButtonIndex: destructive },
      (i) => options[i]?.onPress(),
    );
    return;
  }
  Alert.alert(title ?? "", undefined, [
    ...options.map((o) => ({ text: o.label, onPress: o.onPress, style: o.destructive ? ("destructive" as const) : undefined })),
    { text: "Cancel", style: "cancel" as const },
  ]);
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  if (!ready) return <Loading />;
  if (!user) {
    return (
      <Screen>
        <H1>Sign in to continue</H1>
        <Muted>Your rankings, watchlist, and live shows stay on your account.</Muted>
        <Button label="Sign in" onPress={() => router.push("/login")} />
        <Button label="Create an account" tone="ghost" onPress={() => router.push("/register")} />
      </Screen>
    );
  }
  return <>{children}</>;
}

export function ScoreBadge({ score, color, size = 44 }: { score: number; color: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
      <Text style={{ color, fontWeight: "800", fontSize: size > 60 ? 28 : 14 }}>{score.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  error: { color: colors.disliked, fontSize: 13 },
  empty: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 20, backgroundColor: colors.panel, gap: 6 },
  emptyTitle: { color: colors.text, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  h1: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.4 },
  h2: { color: colors.text, fontSize: 17, fontWeight: "800" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  btn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" },
  btnPrimary: { backgroundColor: colors.brand2 },
  btnGhost: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
  btnDanger: { backgroundColor: "transparent" },
  btnLabel: { color: "white", fontWeight: "700" },
  disabled: { opacity: 0.5 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, paddingHorizontal: 12, paddingVertical: 8 },
  segmented: { flexDirection: "row", backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 4 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  segmentTextActive: { color: colors.ink },
  chipActive: { borderColor: colors.brand, backgroundColor: "rgba(245,158,11,0.12)" },
  chipLabel: { color: colors.zinc, fontSize: 13, fontWeight: "600" },
  chipCount: { fontSize: 10, fontWeight: "600" },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
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
  group: { backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: "600" },
  rowValue: { flex: 1, color: colors.muted, fontSize: 15, textAlign: "right" },
  chevron: { color: colors.muted, fontSize: 22, lineHeight: 22, marginLeft: "auto" },
  card: { backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 },
  avatar: { backgroundColor: colors.brand2, alignItems: "center", justifyContent: "center" },
  badge: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
