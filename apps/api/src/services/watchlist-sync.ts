import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { watchlistItems } from "../db/schema";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Once you've ranked a title it has been watched — drop it from the watchlist. */
export async function clearWatchedTitle(tx: Tx | DB, userId: string, titleId: number) {
  await tx.delete(watchlistItems).where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.titleId, titleId)));
}

/** Logging a show crosses off every performer on the bill, and the festival itself when names match. */
export async function clearSeenLive(tx: Tx | DB, userId: string, performerIds: number[], festivalName: string | null) {
  if (performerIds.length > 0) {
    await tx
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.userId, userId), inArray(watchlistItems.performerId, performerIds)));
  }
  if (festivalName) {
    await tx
      .delete(watchlistItems)
      .where(
        and(
          eq(watchlistItems.userId, userId),
          sql`lower(${watchlistItems.festivalName}) = lower(${festivalName.trim()})`,
        ),
      );
  }
}
