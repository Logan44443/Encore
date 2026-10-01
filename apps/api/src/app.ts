import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env";
import { rateLimit } from "./lib/rate-limit";
import { rejectRevokedSessions } from "./lib/sessions";
import { catalog } from "./providers/catalog";
import { setlistFmEnabled } from "./providers/setlistfm";
import { accountRoutes } from "./routes/account";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { entryRoutes } from "./routes/entries";
import { companionRoutes, friendRoutes, safetyRoutes } from "./routes/friends";
import { liveRoutes } from "./routes/live";
import { musicRoutes } from "./routes/music";
import { passwordResetRoutes } from "./routes/password-reset";
import { userRoutes } from "./routes/users";
import { watchlistRoutes } from "./routes/watchlist";

export const app = new Hono()
  .use(logger())
  .use(secureHeaders())
  .use(cors({ origin: env.corsOrigins.includes("*") ? "*" : env.corsOrigins, maxAge: 86400 }))
  // The largest real payload is a festival with full setlists (well under 1 MB).
  .use(bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "Request is too large" }, 413) }))
  // Searches fan out to TMDB / MusicBrainz (which allows ~1 request/second in total), so cap them per IP.
  .use("/catalog/search", rateLimit(60, 60_000, "catalog-search"))
  .use("/music/*", rateLimit(40, 60_000, "music"))
  .use(rejectRevokedSessions)
  .get("/", (c) =>
    c.json({
      name: "Encore API",
      message: "This is the backend. Open the website at http://localhost:3000",
      health: "/health",
    }),
  )
  .get("/health", (c) =>
    c.json({ ok: true as const, providers: { tmdb: catalog.kind, setlistFm: setlistFmEnabled } }),
  )
  .route("/auth", authRoutes)
  .route("/auth/password-reset", passwordResetRoutes)
  .route("/catalog", catalogRoutes)
  .route("/entries", entryRoutes)
  .route("/music", musicRoutes)
  .route("/live", liveRoutes)
  .route("/watchlist", watchlistRoutes)
  .route("/account", accountRoutes)
  .route("/users", userRoutes)
  .route("/friends", friendRoutes)
  .route("/companions", companionRoutes)
  .route("/", safetyRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

/** Postgres SQLSTATE of a database error, looking through Drizzle's wrapper. */
function pgCode(err: unknown): string | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 3; e = e.cause as typeof e, i++) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.res ? err.getResponse() : c.json({ error: err.message }, err.status);
  switch (pgCode(err)) {
    // Two requests raced past a "does it exist?" check; the unique index caught the second.
    case "23505":
      return c.json({ error: "That already exists — refresh and try again" }, 409);
    // Referenced row is gone (e.g. a token for a deleted account).
    case "23503":
      return c.json({ error: "Something this depends on no longer exists — refresh and try again" }, 409);
    case "22007":
    case "22008":
      return c.json({ error: "Invalid date" }, 400);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export type AppType = typeof app;
