import { Text } from "react-native";
import { colors } from "../theme";

/** The Encore wordmark with the orange E, set as one word. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <Text style={{ color: colors.text, fontSize: size, fontWeight: "900", letterSpacing: -0.5 }}>
      <Text style={{ color: colors.brand }}>E</Text>ncore
    </Text>
  );
}
