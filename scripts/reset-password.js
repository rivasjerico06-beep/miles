// Gives an account a new temporary password (for users who forgot theirs) and signs it out everywhere.
// Usage: node --env-file=.env.production.local scripts/reset-password.js someone@example.com
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { hashPassword } from "../server/auth.js";
import { sessions, users } from "../server/db/schema.js";

const email = String(process.argv[2] || "").trim().toLowerCase();
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!email || !url) {
  console.error("Usage: node --env-file=.env.production.local scripts/reset-password.js someone@example.com");
  process.exit(1);
}

const db = drizzle({ client: neon(url) });
const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
if (!user) {
  console.error(`No account uses ${email}.`);
  process.exit(1);
}
const temporary = randomBytes(6).toString("base64url");
await db.update(users).set({ passwordHash: await hashPassword(temporary) }).where(eq(users.id, user.id));
await db.delete(sessions).where(eq(sessions.userId, user.id));
console.log(`New temporary password for ${user.fullName} (${user.role}): ${temporary}`);
console.log("Ask them to log in and change it under Account > Change password.");
