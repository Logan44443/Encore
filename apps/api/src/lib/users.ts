import type { User } from "@encore/shared";
import { sql } from "drizzle-orm";
import { users } from "../db/schema";

/**
 * Usernames keep the capitalisation people typed but are unique ignoring case
 * (unique index on lower(username)), so every lookup compares lowercased too.
 */
export const usernameIs = (username: string) => sql`lower(${users.username}) = lower(${username})`;

/** The signed-in user's own account. Never return this for someone else: it carries their email. */
export const toUser = (u: typeof users.$inferSelect): User => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  email: u.email,
  country: u.country,
  countryManual: u.countryManual,
  services: u.services,
});
