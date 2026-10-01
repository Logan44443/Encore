import { createLiveShowSchema, updateLiveShowSchema } from "@encore/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVars } from "../lib/auth";
import { validate } from "../lib/validate";
import { withShowCompanions } from "../services/companions";
import { copyLiveShow, createLiveShow, deleteLiveShow, getOwnLiveShow, listLiveShows, updateLiveShow } from "../services/live";

const idParam = validate("param", z.object({ id: z.uuid() }));

export const liveRoutes = new Hono<AuthVars>()
  .use(requireAuth)
  .get("/", async (c) => {
    const userId = c.get("userId");
    return c.json({ shows: await withShowCompanions(await listLiveShows(userId), userId, userId) });
  })
  .get("/:id", idParam, async (c) => c.json({ show: await getOwnLiveShow(c.req.valid("param").id, c.get("userId")) }))
  .post("/:id/copy", idParam, async (c) => c.json({ show: await copyLiveShow(c.get("userId"), c.req.valid("param").id) }, 201))
  .post("/", validate("json", createLiveShowSchema), async (c) =>
    c.json({ show: await createLiveShow(c.get("userId"), c.req.valid("json")) }, 201),
  )
  .patch("/:id", idParam, validate("json", updateLiveShowSchema), async (c) =>
    c.json({ show: await updateLiveShow(c.get("userId"), c.req.valid("param").id, c.req.valid("json")) }),
  )
  .delete("/:id", idParam, async (c) => {
    await deleteLiveShow(c.get("userId"), c.req.valid("param").id);
    return c.body(null, 204);
  });
