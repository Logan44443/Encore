import type { PublicUser } from "@encore/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { Avatar } from "./ui";

/** A person in a list: tap to open their profile. `action` sits on the right (Accept, Add, …). */
export function PersonRow({
  user,
  action,
  detail,
  link = true,
}: {
  user: PublicUser;
  action?: React.ReactNode;
  detail?: string;
  /** False where their profile can't be opened (people you blocked). */
  link?: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable onPress={link ? () => router.push(`/user/${user.username}`) : undefined} disabled={!link} style={styles.row}>
      <Avatar name={user.displayName} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {user.displayName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          @{user.username}
          {detail ? ` · ${detail}` : ""}
        </Text>
      </View>
      {action}
    </Pressable>
  );
}

/** A compact button for the right side of a PersonRow. */
export function RowButton({ label, onPress, tone = "primary", disabled }: { label: string; onPress: () => void; tone?: "primary" | "ghost"; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.btn, tone === "primary" ? { backgroundColor: colors.brand2 } : styles.ghost, disabled && { opacity: 0.5 }]}
    >
      <Text style={{ color: tone === "primary" ? "white" : colors.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  ghost: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
});
