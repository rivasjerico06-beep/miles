// Embedded Postgres (PGlite) for local development and tests. Never used on Vercel.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.js";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

// dataDir: a folder to keep the data between runs, or undefined for an in-memory database.
export async function createLocalDb(dataDir) {
  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => client.close() };
}
