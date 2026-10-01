/**
 * Moderation queue for reports made in the app. Uses the same database as the API.
 *   npm run reports -w @encore/api                        list open reports
 *   npm run reports -w @encore/api -- resolve <id> actioned   (or dismissed)
 * Apple expects reports to be acted on within about a day.
 */
import { asc, eq } from "drizzle-orm";
import { database, db } from "../src/db/client";
import { reports, users } from "../src/db/schema";

const [command, id, outcome] = process.argv.slice(2);

if (command === "resolve") {
  if (!id || (outcome !== "actioned" && outcome !== "dismissed")) {
    console.error("Usage: reports resolve <report id> actioned|dismissed");
    process.exitCode = 1;
  } else {
    const [row] = await db.update(reports).set({ status: outcome, resolvedAt: new Date() }).where(eq(reports.id, id)).returning();
    console.log(row ? `Report ${id} marked ${outcome}.` : `No report ${id}.`);
  }
} else {
  const rows = await db
    .select({ report: reports, reporter: users.username })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.reporterId))
    .where(eq(reports.status, "open"))
    .orderBy(asc(reports.createdAt));
  if (!rows.length) console.log("No open reports.");
  for (const { report: r, reporter } of rows) {
    console.log(
      [
        `${r.id}  ${r.createdAt.toISOString()}`,
        `  ${r.kind} report on @${r.targetUsername}${r.targetUserId ? "" : " (account deleted)"}: ${r.reason}`,
        r.targetId ? `  item: ${r.targetId}` : null,
        r.details ? `  details: ${r.details}` : null,
        `  from: ${reporter ? `@${reporter}` : "a deleted account"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}
await database.close();
