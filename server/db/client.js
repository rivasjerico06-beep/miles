import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

let db = null;

// Local development and tests install their own database (see server/db/local.js).
export function setDb(instance) {
  db = instance;
}

// Production: Neon Postgres over HTTP, created on first use so builds never need the database.
export function getDb() {
  if (db) return db;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw Object.assign(new Error("The database is not configured yet (DATABASE_URL is missing)."), { status: 503 });
  }
  db = drizzle({ client: neon(url), schema });
  return db;
}
