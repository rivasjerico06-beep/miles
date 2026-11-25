// Applies the SQL migrations in /drizzle to the Neon database.
// Runs automatically on every Vercel build (npm run vercel-build).
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.warn("DATABASE_URL is not set: skipping database migrations.");
  process.exit(0);
}

await migrate(drizzle({ client: neon(url) }), {
  migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
});
console.log("Database migrations are up to date.");
