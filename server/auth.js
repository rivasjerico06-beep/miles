// Accounts and sessions: scrypt password hashes and an HttpOnly session cookie.
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { sessions, students, users } from "./db/schema.js";

const scrypt = promisify(scryptCallback);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_COOKIE = "cp_session";
const SESSION_DAYS = 30;

export function sha256(value) {
  return createHash("sha256").update(value).digest("base64url");
}

// Constant-time comparison of two strings of any length.
export function safeEqual(a, b) {
  return timingSafeEqual(createHash("sha256").update(String(a)).digest(), createHash("sha256").update(String(b)).digest());
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, n, r, p, salt, hash] = String(stored || "").split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(key, expected);
}

// Spends the same time as a real check, so unknown emails can't be told apart by timing.
const DUMMY_HASH = hashPassword("not-a-real-password");
export async function verifyAgainstDummy(password) {
  await verifyPassword(password, await DUMMY_HASH);
  return false;
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function cookieAttributes() {
  const secure = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  return `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export async function startSession(res, userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getDb().insert(sessions).values({ id: sha256(token), userId, expiresAt });
  res.append("Set-Cookie", `${SESSION_COOKIE}=${token}; ${cookieAttributes()}; Expires=${expiresAt.toUTCString()}`);
}

export async function endSession(req, res) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await getDb().delete(sessions).where(eq(sessions.id, sha256(token)));
  res.append("Set-Cookie", `${SESSION_COOKIE}=; ${cookieAttributes()}; Max-Age=0`);
}

// The signed-in user for this request, or null.
export async function loadUser(req) {
  if (req.user !== undefined) return req.user;
  req.user = null;
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const db = getDb();
  const id = sha256(token);
  const [row] = await db
    .select({ user: users, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 6 * 60 * 60 * 1000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  }
  req.user = row.user;
  req.sessionId = id;
  return row.user;
}

// Route guard: requireRole() for any signed-in user, requireRole("teacher") for one role.
export function requireRole(...roles) {
  return async (req, res, next) => {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: "Please log in again." });
    if (roles.length > 0 && !roles.includes(user.role)) {
      return res.status(403).json({ error: "This page is not available for your account." });
    }
    next();
  };
}

export async function studentForUser(userId) {
  const [student] = await getDb().select().from(students).where(eq(students.userId, userId)).limit(1);
  return student ?? null;
}

export async function childForParent(parentUserId) {
  const [child] = await getDb().select().from(students).where(eq(students.parentUserId, parentUserId)).limit(1);
  return child ?? null;
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    gradeSection: user.gradeSection || "",
  };
}

// Blocks state-changing requests that come from another website (CSRF).
// The scanner sends no Origin header, so it is unaffected.
export function sameOriginOnly(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  try {
    if (new URL(origin).host === host) return next();
  } catch {
    /* fall through */
  }
  return res.status(403).json({ error: "This request was blocked because it came from another website." });
}
