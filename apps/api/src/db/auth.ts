import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * Supabase Auth's own tables, read (never written) by the API. Kept out of
 * schema.ts so drizzle-kit never tries to create or change them.
 */
const auth = pgSchema("auth");

/** One row per signed-in device. Signing out (or "sign out of other devices") deletes it. */
export const authSessions = auth.table("sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
});

export { authUsers } from "drizzle-orm/supabase";
