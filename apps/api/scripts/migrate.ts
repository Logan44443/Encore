/**
 * Applies pending migrations to the database in DATABASE_URL. Render runs this
 * before every deploy; locally the API also runs it when it starts.
 *   npm run db:migrate -w @encore/api
 */
import { database } from "../src/db/client";
import { migrateDatabase } from "../src/db/migrate";

await migrateDatabase();
console.log("[db] migrations applied");
await database.close();
