import { tierForScore, type Tier } from "@encore/shared";

export const colors = {
  ink: "#0b0b0f",
  panel: "#14141b",
  panel2: "#1c1c26",
  line: "#2a2a36",
  muted: "#8b8b9e",
  brand: "#f59e0b",
  brand2: "#e11d48",
  liked: "#22c55e",
  fine: "#eab308",
  disliked: "#ef4444",
  text: "#f4f4f5",
  zinc: "#d4d4d8",
};

export const tierColor: Record<Tier, string> = {
  liked: colors.liked,
  fine: colors.fine,
  disliked: colors.disliked,
};

/**
 * The one colour for any 0–10 score: green for the "liked" range, yellow for
 * "fine", red for "disliked" (see TIER_RANGES). Use this (or ScoreBadge, which
 * uses it) wherever a score is shown, whatever the media type, so every score
 * in the app reads the same. No score is muted.
 */
export function scoreColor(score: number | null | undefined): string {
  return score === null || score === undefined ? colors.muted : tierColor[tierForScore(score)];
}

export const headerOptions = {
  headerStyle: { backgroundColor: colors.ink },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: "700" as const },
  contentStyle: { backgroundColor: colors.ink },
  headerBackTitle: "Back",
  headerBackButtonDisplayMode: "generic" as const,
  // Edge swipes fight the rating slider and other horizontal drags; leave via the Back button only.
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
};
