import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env";
import { catalog } from "./providers/catalog";
import { setlistFmEnabled } from "./providers/setlistfm";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { entryRoutes } from "./routes/entries";
import { liveRoutes } from "./routes/live";
import { musicRoutes } from "./routes/music";
import { userRoutes } from "./routes/users";
import { watchlistRoutes } from "./routes/watchlist";

export const app = new Hono()
  .use(logger())
  .use(secureHeaders())
  .use(cors({ origin: env.corsOrigins.includes("*") ? "*" : env.corsOrigins, maxAge: 86400 }))
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
  .route("/catalog", catalogRoutes)
  .route("/entries", entryRoutes)
  .route("/music", musicRoutes)
  .route("/live", liveRoutes)
  .route("/watchlist", watchlistRoutes)
  .route("/users", userRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export type AppType = typeof app;
