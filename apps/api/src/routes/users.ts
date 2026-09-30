import { mediaTypeSchema, type Profile } from "@encore/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client";
import { titleEntries, users } from "../db/schema";
import { validate } from "../lib/validate";
import { listEntries } from "../services/entries";
import { listLiveShows, liveStats } from "../services/live";

const usernameParam = validate("param", z.object({ username: z.string().toLowerCase() }));

async function findUser(username: string) {
  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (!user) throw new HTTPException(404, { message: "User not found" });
  return user;
}

export const userRoutes = new Hono()
  .get("/:username", usernameParam, async (c) => {
    const user = await findUser(c.req.valid("param").username);
    const [[entryStats], live, topMovies, topShows, recentLiveShows] = await Promise.all([
      db
        .select({
          movies: sql<number>`count(*) filter (where ${titleEntries.mediaType} = 'movie')`.mapWith(Number),
          series: sql<number>`count(*) filter (where ${titleEntries.mediaType} = 'tv')`.mapWith(Number),
        })
        .from(titleEntries)
        .where(eq(titleEntries.userId, user.id)),
      liveStats(user.id),
      listEntries(user.id, { mediaType: "movie", limit: 10 }),
      listEntries(user.id, { mediaType: "tv", limit: 10 }),
      listLiveShows(user.id, 6),
    ]);
    const profile: Profile = {
      user: { id: user.id, username: user.username, displayName: user.displayName },
      stats: { ...entryStats, ...live },
      topMovies,
      topShows,
      recentLiveShows,
    };
    return c.json(profile);
  })

  .get("/:username/entries", usernameParam, validate("query", z.object({ mediaType: mediaTypeSchema.optional() })), async (c) => {
    const user = await findUser(c.req.valid("param").username);
    return c.json({ entries: await listEntries(user.id, c.req.valid("query")) });
  })

  .get("/:username/live", usernameParam, async (c) => {
    const user = await findUser(c.req.valid("param").username);
    return c.json({ shows: await listLiveShows(user.id) });
  });
