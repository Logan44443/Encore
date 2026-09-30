import { addWatchlistSchema, updateWatchlistSchema, WATCHLIST_KINDS } from "@encore/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVars } from "../lib/auth";
import { validate } from "../lib/validate";
import { invalidateFeed } from "../services/feed";
import { addToWatchlist, listWatchlist, removeFromWatchlist, updateWatchlistItem } from "../services/watchlist";

const idParam = validate("param", z.object({ id: z.uuid() }));

export const watchlistRoutes = new Hono<AuthVars>()
  .use(requireAuth)
  .use(async (c, next) => {
    await next();
    if (c.req.method !== "GET" && c.res.ok) invalidateFeed(c.get("userId"));
  })
  .get("/", validate("query", z.object({ kind: z.enum(WATCHLIST_KINDS).optional() })), async (c) =>
    c.json({ items: await listWatchlist(c.get("userId"), c.req.valid("query").kind) }),
  )
  .post("/", validate("json", addWatchlistSchema), async (c) =>
    c.json({ item: await addToWatchlist(c.get("userId"), c.req.valid("json")) }, 201),
  )
  .patch("/:id", idParam, validate("json", updateWatchlistSchema), async (c) =>
    c.json({ item: await updateWatchlistItem(c.get("userId"), c.req.valid("param").id, c.req.valid("json")) }),
  )
  .delete("/:id", idParam, async (c) => {
    await removeFromWatchlist(c.get("userId"), c.req.valid("param").id);
    return c.body(null, 204);
  });
