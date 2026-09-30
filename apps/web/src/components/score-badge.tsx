import type { Tier } from "@encore/shared";

const TIER_STYLES: Record<Tier, string> = {
  liked: "border-liked/50 text-liked",
  fine: "border-fine/50 text-fine",
  disliked: "border-disliked/50 text-disliked",
};

export function ScoreBadge({ score, tier, size = "md" }: { score: number; tier: Tier; size?: "md" | "lg" }) {
  const dims = size === "lg" ? "h-20 w-20 text-3xl" : "h-11 w-11 text-sm";
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full border-2 font-bold ${dims} ${TIER_STYLES[tier]}`}>
      {score.toFixed(1)}
    </div>
  );
}
