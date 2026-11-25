// Small helpers shared by the API routes.

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function fail(status, message, extra) {
  throw new HttpError(status, message, extra);
}

// Validates input with a zod schema and turns the first problem into a readable 400 error.
export function parse(schema, value) {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new HttpError(400, issue?.message || "Some of the details are not valid.");
}

// Best-effort, per-instance rate limiting for sign-in, sign-up and SOS.
const buckets = new Map();
export function tooManyAttempts(key, limit, windowMs) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    if (buckets.size > 5000) {
      for (const [name, value] of buckets) if (now - value.start > windowMs) buckets.delete(name);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// Background work that may finish after the response (push notifications).
// On Vercel it is kept alive with waitUntil; tests can await flushBackground().
const pending = new Set();
let waitUntilFn = null;
let waitUntilLoaded = false;

async function loadWaitUntil() {
  if (waitUntilLoaded) return waitUntilFn;
  waitUntilLoaded = true;
  try {
    ({ waitUntil: waitUntilFn } = await import("@vercel/functions"));
  } catch {
    waitUntilFn = null;
  }
  return waitUntilFn;
}

export function runInBackground(work) {
  const task = Promise.resolve()
    .then(work)
    .catch((error) => console.error("[background]", error))
    .finally(() => pending.delete(task));
  pending.add(task);
  loadWaitUntil().then((waitUntil) => {
    try {
      waitUntil?.(task);
    } catch {
      /* not running on Vercel */
    }
  });
  return task;
}

export async function flushBackground() {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}

export function toCsv(rows, columns) {
  const cell = (value) => {
    if (value === null || value === undefined) return "";
    const text = value instanceof Date ? value.toISOString() : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((column) => cell(column.label)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => cell(column.value(row))).join(","));
  return lines.join("\r\n") + "\r\n";
}
