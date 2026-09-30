import { serve } from "@hono/node-server";
import { app } from "./app";
import { database } from "./db/client";
import { env } from "./env";
import { pruneCache } from "./lib/swr-cache";
import { checkCatalog } from "./providers/catalog";

await database.migrate();
void pruneCache().catch(() => undefined);
void checkCatalog();

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});

async function shutdown() {
  server.close();
  await database.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
