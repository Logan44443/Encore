import {
  createEntrySchema,
  createSeasonEntrySchema,
  mediaTypeSchema,
  rerankEntrySchema,
  rerankSeasonEntrySchema,
  tierSchema,
  updateEntrySchema,
} from "@encore/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVars } from "../lib/auth";
import { validate } from "../lib/validate";
import { invalidateDiscover } from "../services/discover";
import { invalidateFeed } from "../services/feed";
import {
  createEntry,
  deleteEntry,
  listEntries,
  rankCandidates,
  rerankEntry,
  updateEntry,
} from "../services/entries";
import {
  createSeasonEntry,
  deleteSeasonEntry,
  listSeasonEntries,
  rerankSeasonEntry,
  seasonCandidates,
} from "../services/seasons";

const idParam = validate("param", z.object({ id: z.uuid() }));

export const entryRoutes = new Hono<AuthVars>()
  .use(requireAuth)
  .use(async (c, next) => {
    await next();
    if (c.req.method !== "GET" && c.res.ok) {
      invalidateDiscover();
      invalidateFeed(c.get("userId"));
    }
  })

  .get(
    "/",
    validate("query", z.object({ mediaType: mediaTypeSchema.optional(), genreId: z.coerce.number().int().optional() })),
    async (c) => c.json({ entries: await listEntries(c.get("userId"), c.req.valid("query")) }),
  )

  .get(
    "/candidates",
    validate(
      "query",
      z.object({
        mediaType: mediaTypeSchema,
        genreId: z.coerce.number().int(),
        tier: tierSchema,
        excludeEntryId: z.uuid().optional(),
      }),
    ),
    async (c) => {
      const { excludeEntryId, ...key } = c.req.valid("query");
      return c.json({ candidates: await rankCandidates({ userId: c.get("userId"), ...key }, excludeEntryId) });
    },
  )

  .get(
    "/seasons",
    validate("query", z.object({ tmdbId: z.coerce.number().int().positive() })),
    async (c) => c.json({ seasons: await listSeasonEntries(c.get("userId"), c.req.valid("query").tmdbId) }),
  )

  .get(
    "/seasons/candidates",
    validate(
      "query",
      z.object({
        tmdbId: z.coerce.number().int().positive(),
        tier: tierSchema,
        excludeEntryId: z.uuid().optional(),
      }),
    ),
    async (c) => {
      const { tmdbId, tier, excludeEntryId } = c.req.valid("query");
      return c.json({ candidates: await seasonCandidates(c.get("userId"), tmdbId, tier, excludeEntryId) });
    },
  )

  .post("/seasons", validate("json", createSeasonEntrySchema), async (c) =>
    c.json(await createSeasonEntry(c.get("userId"), c.req.valid("json")), 201),
  )

  .put("/seasons/:id/rank", idParam, validate("json", rerankSeasonEntrySchema), async (c) =>
    c.json(await rerankSeasonEntry(c.get("userId"), c.req.valid("param").id, c.req.valid("json"))),
  )

  .delete("/seasons/:id", idParam, async (c) => {
    await deleteSeasonEntry(c.get("userId"), c.req.valid("param").id);
    return c.body(null, 204);
  })

  .post("/", validate("json", createEntrySchema), async (c) =>
    c.json(await createEntry(c.get("userId"), c.req.valid("json")), 201),
  )

  .patch("/:id", idParam, validate("json", updateEntrySchema), async (c) =>
    c.json({ entry: await updateEntry(c.get("userId"), c.req.valid("param").id, c.req.valid("json")) }),
  )

  .put("/:id/rank", idParam, validate("json", rerankEntrySchema), async (c) =>
    c.json(await rerankEntry(c.get("userId"), c.req.valid("param").id, c.req.valid("json"))),
  )

  .delete("/:id", idParam, async (c) => {
    await deleteEntry(c.get("userId"), c.req.valid("param").id);
    return c.body(null, 204);
  });
