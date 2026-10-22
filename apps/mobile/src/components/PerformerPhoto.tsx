import { Image } from "expo-image";
import { useState } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { colors } from "../theme";

/**
 * A performer's photo, or their initials when there's no photo (or it fails to
 * load). Round by default; `square` gives the rounded-corner tile used in lists.
 */
export function PerformerPhoto({
  uri,
  name,
  size = 44,
  square,
  style,
}: {
  uri: string | null;
  name: string;
  size?: number;
  square?: boolean;
  style?: ViewStyle;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const radius = square ? Math.round(size * 0.22) : size / 2;
  const box: ViewStyle = { width: size, height: size, borderRadius: radius, backgroundColor: colors.panel2, overflow: "hidden", ...style };

  if (!uri || failed === uri) {
    return (
      <View style={[box, { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line }]}>
        <Text style={{ color: colors.muted, fontSize: size * 0.36, fontWeight: "800" }}>{initials(name)}</Text>
      </View>
    );
  }
  return (
    <View style={box}>
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        contentFit="cover"
        contentPosition="top"
        transition={150}
        onError={() => setFailed(uri)}
        accessibilityLabel={name}
      />
    </View>
  );
}

function initials(name: string) {
  const words = name.replace(/^the\s+/i, "").split(/\s+/).filter(Boolean).map((w) => Array.from(w));
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2).join("")).toUpperCase();
}
