import { createLiveShowSchema, updateLiveShowSchema } from "@encore/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVars } from "../lib/auth";
import { assertAcceptableText } from "../lib/moderation";
import { validate } from "../lib/validate";
import { withShowCompanions } from "../services/companions";
import { copyLiveShow, createLiveShow, deleteLiveShow, getOwnLiveShow, listLiveShows, updateLiveShow } from "../services/live";

const idParam = validate("param", z.object({ id: z.uuid() }));

/**
 * What people write about a show that friends can see. Song titles, tour names and performer
 * names are left out: they mostly come from setlist.fm and MusicBrainz, and real song titles
 * ("Niggas in Paris") would otherwise stop a setlist being saved.
 */
function showText(v: z.output<typeof updateLiveShowSchema>): (string | null | undefined)[] {
  return [v.name, v.liked, v.disliked, v.notes, ...(v.lineup ?? []).flatMap((slot) => slot.songs.map((song) => song.note))];
}

export const liveRoutes = new Hono<AuthVars>()
  .use(requireAuth)
  .get("/", async (c) => {
    const userId = c.get("userId");
    return c.json({ shows: await withShowCompanions(await listLiveShows(userId), userId, userId) });
  })
  .get("/:id", idParam, async (c) => c.json({ show: await getOwnLiveShow(c.req.valid("param").id, c.get("userId")) }))
  .post("/:id/copy", idParam, async (c) => c.json({ show: await copyLiveShow(c.get("userId"), c.req.valid("param").id) }, 201))
  .post("/", validate("json", createLiveShowSchema), async (c) => {
    assertAcceptableText(...showText(c.req.valid("json")));
    return c.json({ show: await createLiveShow(c.get("userId"), c.req.valid("json")) }, 201);
  })
  .patch("/:id", idParam, validate("json", updateLiveShowSchema), async (c) => {
    assertAcceptableText(...showText(c.req.valid("json")));
    return c.json({ show: await updateLiveShow(c.get("userId"), c.req.valid("param").id, c.req.valid("json")) });
  })
  .delete("/:id", idParam, async (c) => {
    await deleteLiveShow(c.get("userId"), c.req.valid("param").id);
    return c.body(null, 204);
  });
