import { isoDateSchema } from "@encore/shared";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import { photoCredit, setlistCredit } from "../providers/credits";
import { searchPerformers } from "../providers/musicbrainz";
import { performerSetlists, setlistFmEnabled } from "../providers/setlistfm";

export const musicRoutes = new Hono()
  .get("/performers/search", validate("query", z.object({ q: z.string().trim().min(1).max(200) })), async (c) => {
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({ performers: await searchPerformers(c.req.valid("query").q) });
  })

  .get(
    "/performers/:mbid/setlists",
    validate("param", z.object({ mbid: z.uuid() })),
    validate(
      "query",
      z.object({
        date: isoDateSchema.optional(),
        page: z.coerce.number().int().min(1).max(50).optional(),
      }),
    ),
    async (c) => {
      const setlists = await performerSetlists(c.req.valid("param").mbid, c.req.valid("query"));
      return c.json({ setlists, enabled: setlistFmEnabled });
    },
  )

  .get(
    "/credits",
    validate("query", z.object({ photo: z.url().max(1000).optional(), setlist: z.string().trim().max(50).optional() })),
    async (c) => {
      const { photo, setlist } = c.req.valid("query");
      const [photoC, setlistC] = await Promise.all([photo ? photoCredit(photo) : null, setlist ? setlistCredit(setlist) : null]);
      c.header("Cache-Control", "private, max-age=86400");
      return c.json({ photo: photoC, setlist: setlistC });
    },
  );
