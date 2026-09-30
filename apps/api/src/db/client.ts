import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { env } from "../env";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = path.resolve(process.env.MIGRATIONS_DIR ?? "drizzle");

/**
 * Real Postgres when DATABASE_URL is set, otherwise embedded Postgres (PGlite)
 * on disk. Same SQL dialect and migrations either way.
 */
async function connect(): Promise<{ db: DB; migrate: () => Promise<void>; close: () => Promise<void> }> {
  if (env.databaseUrl) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(env.databaseUrl, { max: 10 });
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as DB,
      migrate: () => migrate(db, { migrationsFolder }),
      close: () => client.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = env.pgliteDir === "memory://" ? env.pgliteDir : path.resolve(env.pgliteDir);
  if (dir !== "memory://") mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  console.log(`[db] using embedded Postgres at ${dir}`);
  return {
    db: db as unknown as DB,
    migrate: () => migrate(db, { migrationsFolder }),
    close: () => client.close(),
  };
}

export const database = await connect();
export const db = database.db;
