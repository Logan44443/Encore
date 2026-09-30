import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { colors } from "../theme";

const STEP = 0.1;

function snap(value: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}

/** Drag-to-set score between `min` and `max` in 0.1 steps, with −/+ for fine tuning. */
export function ScoreSlider({
  value,
  min,
  max,
  color,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  color: string;
  onChange: (value: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const fraction = max > min ? (value - min) / (max - min) : 0;

  const fromTouch = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    const next = snap(min + (e.nativeEvent.locationX / width) * (max - min), min, max);
    if (next !== value) onChange(next);
  };
  const nudge = (delta: number) => onChange(snap(value + delta, min, max));

  return (
    <View style={styles.row}>
      <Pressable onPress={() => nudge(-STEP)} style={styles.step} accessibilityLabel="Lower score">
        <Text style={styles.stepLabel}>−</Text>
      </Pressable>
      <View
        style={styles.hit}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={fromTouch}
        onResponderMove={fromTouch}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Score"
        accessibilityValue={{ min, max, now: value, text: value.toFixed(1) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === "increment" ? STEP : -STEP)}
      >
        <View pointerEvents="none" style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: color }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: fraction * width - 14, borderColor: color }]} />
      </View>
      <Pressable onPress={() => nudge(STEP)} style={styles.step} accessibilityLabel="Raise score">
        <Text style={styles.stepLabel}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  hit: { flex: 1, height: 44, justifyContent: "center" },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 6 },
  thumb: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    backgroundColor: colors.text,
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: { color: colors.text, fontSize: 20, fontWeight: "700" },
});
