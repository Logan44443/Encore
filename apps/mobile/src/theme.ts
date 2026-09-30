import type { Tier } from "@encore/shared";

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
