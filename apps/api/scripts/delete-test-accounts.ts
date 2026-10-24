/**
 * Deletes the accounts the smoke tests create (smoke_…, smoke2_…, smoke3_… and
 * auth_… at example.com), with everything they logged. Real accounts are never touched.
 *   npm run smoke:cleanup -w @encore/api
 */
import { inArray, sql } from "drizzle-orm";
import { database, db } from "../src/db/client";
import { authUsers } from "../src/db/auth";
import { supabaseAdmin } from "../src/lib/supabase";

const rows = await db
  .select({ id: authUsers.id, email: authUsers.email })
  .from(authUsers)
  .where(sql`${authUsers.email} ~ '^(smoke[23]?|auth)_[a-z0-9]+@example\.com$'`);
for (const { id, email } of rows) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  console.log(error ? `couldn't delete ${email}: ${error.message}` : `deleted ${email}`);
}
const left = rows.length ? await db.select({ id: authUsers.id }).from(authUsers).where(inArray(authUsers.id, rows.map((r) => r.id))) : [];
console.log(`${rows.length - left.length} test accounts deleted`);
await database.close();
