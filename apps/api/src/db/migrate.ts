import { sql } from "drizzle-orm";
import { BLOCKED, NAME_ONLY } from "../lib/moderation";
import { rescoreQueuedLists } from "../services/entries";
import { database, db } from "./client";

/**
 * Brings the database up to date: pending migrations, scores for any lists a
 * migration queued to rescore, then the moderation word list the database's own
 * slur filter reads (private.blocked_words), copied from lib/moderation.ts so
 * there's only ever one list.
 */
export async function migrateDatabase() {
  await database.migrate();
  await rescoreQueuedLists();
  const rows = sql.join(
    BLOCKED.map((word) => sql`(${word}, ${!NAME_ONLY.has(word)})`),
    sql`, `,
  );
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from private.blocked_words`);
    await tx.execute(sql`insert into private.blocked_words (word, in_prose) values ${rows}`);
  });
}
