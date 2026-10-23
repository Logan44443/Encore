import { importFixSchema, type ImportSource } from "@encore/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { requireAuth, type AuthVars } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { validate } from "../lib/validate";
import { fixImportItem, getImport, startImport } from "../services/catalog-import";

/** A Letterboxd export ZIP is well under 1 MB for most people; heavy reviewers can reach a few. Goodreads' CSV is smaller. */
const MAX_UPLOAD = 20 * 1024 * 1024;

const sourceParam = validate("param", z.object({ source: z.enum(["letterboxd", "goodreads"] satisfies ImportSource[]) }));

const SITE: Record<ImportSource, string> = { letterboxd: "Letterboxd", goodreads: "Goodreads" };

export const importRoutes = new Hono<AuthVars>()
  .use(requireAuth)
  .get("/:source", sourceParam, async (c) => c.json({ import: await getImport(c.get("userId"), c.req.valid("param").source) }))
  .post(
    "/:source",
    sourceParam,
    rateLimit(10, 60 * 60_000, "catalog-import"),
    bodyLimit({ maxSize: MAX_UPLOAD, onError: (c) => c.json({ error: "That file is too large (20 MB at most)" }, 413) }),
    async (c) => {
      const { source } = c.req.valid("param");
      const body = await c.req.parseBody({ all: true }).catch(() => {
        throw new HTTPException(400, { message: "Upload the export as a file" });
      });
      const raw = body.files;
      const files = (Array.isArray(raw) ? raw : [raw]).filter((f): f is File => f instanceof File);
      if (files.length === 0) throw new HTTPException(400, { message: `Choose your ${SITE[source]} export file` });
      const uploads = await Promise.all(files.map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })));
      return c.json({ import: await startImport(c.get("userId"), source, uploads) }, 202);
    },
  )
  .post("/:source/fix", sourceParam, validate("json", importFixSchema), async (c) => {
    const { key, tmdbId } = c.req.valid("json");
    return c.json({ import: await fixImportItem(c.get("userId"), c.req.valid("param").source, key, tmdbId) });
  });
