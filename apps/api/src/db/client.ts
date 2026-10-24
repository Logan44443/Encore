import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as runMigrations } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = path.resolve(process.env.MIGRATIONS_DIR ?? "drizzle");

/**
 * Supabase Postgres, through its session pooler. The API connects as the
 * database owner, so Row Level Security doesn't apply here: privacy rules are
 * enforced in the routes (lib/social.ts), and the policies guard the app's
 * direct access. The pool stays small because the pooler's limit is shared.
 */
const client = postgres(env.databaseUrl, { max: env.databasePoolSize });
const orm = drizzle(client, { schema });
const db = orm as unknown as DB;

export const database = {
  db,
  /** Runs pending migrations. In production this is the deploy step (npm run db:migrate), not API start-up. */
  migrate: () => runMigrations(orm, { migrationsFolder }),
  close: () => client.end(),
};
export { db };
