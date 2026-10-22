import { letterboxdFixSchema } from "@encore/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { requireAuth, type AuthVars } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { validate } from "../lib/validate";
import { fixLetterboxdFilm, getLetterboxdImport, startLetterboxdImport } from "../services/letterboxd-import";

/** A Letterboxd export ZIP is well under 1 MB for most people; heavy reviewers can reach a few. */
const MAX_UPLOAD = 20 * 1024 * 1024;

export const importRoutes = new Hono<AuthVars>()
  .use(requireAuth)
  .get("/letterboxd", async (c) => c.json({ import: await getLetterboxdImport(c.get("userId")) }))
  .post(
    "/letterboxd",
    rateLimit(10, 60 * 60_000, "letterboxd-import"),
    bodyLimit({ maxSize: MAX_UPLOAD, onError: (c) => c.json({ error: "That file is too large (20 MB at most)" }, 413) }),
    async (c) => {
      const body = await c.req.parseBody({ all: true }).catch(() => {
        throw new HTTPException(400, { message: "Upload the export as a file" });
      });
      const raw = body.files;
      const files = (Array.isArray(raw) ? raw : [raw]).filter((f): f is File => f instanceof File);
      if (files.length === 0) throw new HTTPException(400, { message: "Choose your Letterboxd export file" });
      const uploads = await Promise.all(files.map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })));
      return c.json({ import: await startLetterboxdImport(c.get("userId"), uploads) }, 202);
    },
  )
  .post("/letterboxd/fix", validate("json", letterboxdFixSchema), async (c) => {
    const { key, tmdbId } = c.req.valid("json");
    return c.json({ import: await fixLetterboxdFilm(c.get("userId"), key, tmdbId) });
  });
