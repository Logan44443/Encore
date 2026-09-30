import type { User } from "@encore/shared";
import type { users } from "../db/schema";

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
