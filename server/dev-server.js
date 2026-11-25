// Local API server for `npm run dev`. Uses a built-in Postgres (PGlite) stored in .pglite/
// unless USE_REMOTE_DB=1 and DATABASE_URL are set.
import { setDb } from "./db/client.js";
import { createLocalDb } from "./db/local.js";

const port = Number(process.env.API_PORT || 3001);

if (process.env.USE_REMOTE_DB === "1" && process.env.DATABASE_URL) {
  console.log("API using the database in DATABASE_URL");
} else {
  const { db } = await createLocalDb(process.env.PGLITE_DIR || ".pglite");
  setDb(db);
  console.log("API using the local database in .pglite/");
}

const { createApp } = await import("./app.js");
createApp().listen(port, () => console.log(`API listening on http://localhost:${port}`));
