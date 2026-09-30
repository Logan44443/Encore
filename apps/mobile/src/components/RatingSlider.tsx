import { useRef } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

const STEPS = 20;

/** 0–10 in half-point steps. Drag or tap anywhere on the bar. */
export function RatingSlider({
  value,
  onChange,
  invalid,
}: {
  value: number | null;
  onChange: (v: number) => void;
  invalid?: boolean;
}) {
  const track = useRef<View>(null);
  const geo = useRef({ x: 0, w: 1 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const toValue = (pageX: number) => {
    const ratio = Math.min(1, Math.max(0, (pageX - geo.current.x) / geo.current.w));
    return Math.round(ratio * STEPS) / 2;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const pageX = e.nativeEvent.pageX;
        track.current?.measure((_x, _y, w, _h, px) => {
          geo.current = { x: px, w: w || 1 };
          onChangeRef.current(toValue(pageX));
        });
      },
      onPanResponderMove: (_e, g) => onChangeRef.current(toValue(g.moveX)),
    }),
  ).current;

  const pct = value === null ? 0 : (value / 10) * 100;
  const step = (delta: number) => onChange(Math.min(10, Math.max(0, (value ?? 5) + delta)));

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.readout}>
        <Pressable onPress={() => step(-0.5)} style={styles.nudge} hitSlop={8}>
          <Text style={styles.nudgeLabel}>−</Text>
        </Pressable>
        <Text style={[styles.value, value === null && { color: invalid ? colors.disliked : colors.muted }]}>
          {value === null ? "—" : value.toFixed(1)}
          <Text style={styles.outOf}> / 10</Text>
        </Text>
        <Pressable onPress={() => step(0.5)} style={styles.nudge} hitSlop={8}>
          <Text style={styles.nudgeLabel}>+</Text>
        </Pressable>
      </View>
      <View ref={track} style={styles.touch} {...pan.panHandlers}>
        <View style={[styles.bar, invalid && { backgroundColor: "rgba(239,68,68,0.35)" }]}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
        {value !== null && <View style={[styles.thumb, { left: `${pct}%` }]} />}
      </View>
      <View style={styles.ticks}>
        {Array.from({ length: 11 }, (_, n) => (
          <Text key={n} style={[styles.tick, value !== null && Math.floor(value) === n && { color: colors.brand, fontWeight: "800" }]}>
            {n}
          </Text>
        ))}
      </View>
    </View>
  );
}

const THUMB = 26;

const styles = StyleSheet.create({
  readout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20 },
  value: { color: colors.brand, fontSize: 34, fontWeight: "900", minWidth: 120, textAlign: "center" },
  outOf: { color: colors.muted, fontSize: 15, fontWeight: "600" },
  nudge: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, alignItems: "center", justifyContent: "center" },
  nudgeLabel: { color: colors.text, fontSize: 20, fontWeight: "700" },
  touch: { height: 40, justifyContent: "center", marginHorizontal: THUMB / 2 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.panel2, overflow: "hidden" },
  fill: { height: 8, backgroundColor: colors.brand },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    marginLeft: -THUMB / 2,
    backgroundColor: "white",
    borderWidth: 3,
    borderColor: colors.brand,
  },
  ticks: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: THUMB / 2 - 4 },
  tick: { color: colors.muted, fontSize: 11, width: 14, textAlign: "center" },
});
