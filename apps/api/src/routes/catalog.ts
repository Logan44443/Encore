import { countryCodeSchema, dismissTitleSchema, genresFor, mediaTypeSchema } from "@encore/shared";
import { Hono } from "hono";
import { z } from "zod";
import { optionalAuth, requireAuth, type OptionalAuthVars } from "../lib/auth";
import { validate } from "../lib/validate";
import { catalog } from "../providers/catalog";
import { genreRecommendations, genreSummaries, topRated, trending } from "../services/discover";
import { findEntryForTitle } from "../services/entries";
import { dismissTitle, getFeed, undismissTitle } from "../services/feed";
import { getTitle, toTitle } from "../services/titles";
import { watchlistItemIdForTitle } from "../services/watchlist";

const CACHE_PUBLIC = "public, max-age=300, stale-while-revalidate=3600";

export const catalogRoutes = new Hono<OptionalAuthVars>()
  .get(
    "/search",
    validate("query", z.object({ type: mediaTypeSchema, q: z.string().trim().min(1).max(200) })),
    async (c) => {
      const { type, q } = c.req.valid("query");
      c.header("Cache-Control", CACHE_PUBLIC);
      return c.json({ results: await catalog.search(type, q) });
    },
  )

  .get("/trending", validate("query", z.object({ type: mediaTypeSchema })), async (c) =>
    c.json({ results: await trending(c.req.valid("query").type) }),
  )

  .get("/top-rated", validate("query", z.object({ type: mediaTypeSchema })), async (c) =>
    c.json({ results: await topRated(c.req.valid("query").type) }),
  )

  .get("/genres", optionalAuth, validate("query", z.object({ type: mediaTypeSchema })), async (c) =>
    c.json({ genres: await genreSummaries(c.req.valid("query").type, c.get("userId")) }),
  )

  .get(
    "/recommendations",
    optionalAuth,
    validate(
      "query",
      z
        .object({ type: mediaTypeSchema, genreId: z.coerce.number().int() })
        .refine((q) => genresFor(q.type).some((g) => g.id === q.genreId), { message: "Unknown genre for this type" }),
    ),
    async (c) => {
      const { type, genreId } = c.req.valid("query");
      const userId = c.get("userId");
      const [recs, feed] = await Promise.all([
        genreRecommendations(type, genreId, userId),
        userId ? getFeed(userId) : null,
      ]);
      const forYou = (feed?.personalized ? feed.items : []).filter(
        (i) => i.title.mediaType === type && i.title.genreIds.includes(genreId),
      );
      return c.json({ ...recs, forYou });
    },
  )

  .get("/feed", requireAuth, async (c) => c.json(await getFeed(c.get("userId")!)))

  .post("/feed/dismiss", requireAuth, validate("json", dismissTitleSchema), async (c) => {
    await dismissTitle(c.get("userId")!, c.req.valid("json"));
    return c.body(null, 204);
  })

  .delete(
    "/feed/dismiss",
    requireAuth,
    validate("query", z.object({ mediaType: mediaTypeSchema, tmdbId: z.coerce.number().int().positive() })),
    async (c) => {
      const { mediaType, tmdbId } = c.req.valid("query");
      await undismissTitle(c.get("userId")!, mediaType, tmdbId);
      return c.body(null, 204);
    },
  )

  .get(
    "/tv/:tmdbId/season/:season",
    validate("param", z.object({ tmdbId: z.coerce.number().int().positive(), season: z.coerce.number().int().min(0) })),
    async (c) => {
      const { tmdbId, season } = c.req.valid("param");
      c.header("Cache-Control", CACHE_PUBLIC);
      return c.json({ episodes: await catalog.season(tmdbId, season) });
    },
  )

  .get("/regions", async (c) => {
    c.header("Cache-Control", CACHE_PUBLIC);
    return c.json({ regions: await catalog.regions() });
  })

  .get(
    "/:type/:tmdbId/providers",
    validate("param", z.object({ type: mediaTypeSchema, tmdbId: z.coerce.number().int().positive() })),
    validate("query", z.object({ country: countryCodeSchema })),
    async (c) => {
      const { type, tmdbId } = c.req.valid("param");
      const { country } = c.req.valid("query");
      const all = await catalog.watchProviders(type, tmdbId);
      c.header("Cache-Control", CACHE_PUBLIC);
      return c.json({ providers: all[country] ?? null });
    },
  )

  .get(
    "/:type/:tmdbId",
    optionalAuth,
    validate("param", z.object({ type: mediaTypeSchema, tmdbId: z.coerce.number().int().positive() })),
    async (c) => {
      const { type, tmdbId } = c.req.valid("param");
      const title = await getTitle(type, tmdbId);
      const userId = c.get("userId");
      const [myEntry, watchlistItemId] = userId
        ? await Promise.all([findEntryForTitle(userId, type, tmdbId), watchlistItemIdForTitle(userId, title.id)])
        : [null, null];
      return c.json({ title: toTitle(title), myEntry, watchlistItemId });
    },
  );
