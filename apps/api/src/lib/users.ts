import type { PublicUser, User } from "@encore/shared";
import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { authUsers } from "../db/auth";
import { db } from "../db/client";
import { profiles, userSettings } from "../db/schema";

/**
 * Usernames keep the capitalisation people typed but are unique ignoring case
 * (unique index on lower(username)), so every lookup compares lowercased too.
 */
export const usernameIs = (username: string) => sql`lower(${profiles.username}) = lower(${username})`;

type Profile = typeof profiles.$inferSelect;
type Settings = Pick<typeof userSettings.$inferSelect, "country" | "countryManual" | "services">;

/** The signed-in user's own account. Never return this for someone else: it carries their email. */
export const toUser = (p: Profile, s: Settings, email: string): User => ({
  id: p.id,
  username: p.username,
  displayName: p.displayName,
  email,
  country: s.country,
  countryManual: s.countryManual,
  services: s.services,
  privacy: {
    profileVisibility: p.profileVisibility,
    shareReviews: p.shareReviews,
    searchable: p.searchable,
    allowFriendRequests: p.allowFriendRequests,
    allowTags: p.allowTags,
    shareWatchlist: p.shareWatchlist,
  },
});

/** What anyone may see about a person: never their email, country or settings. */
export const toPublicUser = (u: Pick<Profile, "id" | "username" | "displayName">): PublicUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
});

/** Someone's profile, settings and email in one query, or null if the account is gone. */
export async function findAccount(userId: string) {
  const [row] = await db
    .select({ profile: profiles, settings: userSettings, email: authUsers.email })
    .from(profiles)
    .innerJoin(userSettings, eq(userSettings.userId, profiles.id))
    .innerJoin(authUsers, eq(authUsers.id, profiles.id))
    .where(eq(profiles.id, userId))
    .limit(1);
  return row ? { ...row, email: row.email ?? "" } : null;
}

/** The signed-in user's own account, or 401 if it has been deleted. */
export async function loadUser(userId: string): Promise<User> {
  const account = await findAccount(userId);
  if (!account) throw new HTTPException(401, { message: "Account no longer exists" });
  return toUser(account.profile, account.settings, account.email);
}

/** The email behind an email address or a username, for signing in. */
export async function emailForLogin(login: string): Promise<string | null> {
  const key = login.trim().toLowerCase();
  if (key.includes("@")) return key;
  const [row] = await db
    .select({ email: authUsers.email })
    .from(profiles)
    .innerJoin(authUsers, eq(authUsers.id, profiles.id))
    .where(usernameIs(key))
    .limit(1);
  return row?.email ?? null;
}
