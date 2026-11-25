// ESP32-CAM scanner heartbeats: latest status per device plus boot/failure events (for MTBF).
import { desc, eq } from "drizzle-orm";
import { cameraFrames, deviceEvents, devices } from "../db/schema.js";
import { recordRoundTrip } from "./attendance.js";

const CRASH_REASONS = new Set(["panic", "interrupt_watchdog", "task_watchdog", "watchdog", "brownout"]);
// The scanner reports every 10 minutes during school hours.
export const DEVICE_ONLINE_MS = 25 * 60 * 1000;
// During its preview the scanner sends a picture every one or two seconds.
export const CAMERA_LIVE_MS = 15 * 1000;

// Keeps only the newest picture per scanner.
export async function saveCameraFrame(db, deviceId, frame) {
  const values = {
    jpegBase64: frame.jpeg,
    width: frame.width,
    height: frame.height,
    seq: frame.seq,
    stats: frame.stats ?? null,
    receivedAt: new Date(),
  };
  await db.insert(cameraFrames).values({ deviceId, ...values }).onConflictDoUpdate({ target: cameraFrames.deviceId, set: values });
}

// Newest picture of one scanner (or of whichever scanner sent one last).
export async function latestCameraFrame(db, deviceId) {
  const query = db.select().from(cameraFrames);
  const [row] = deviceId
    ? await query.where(eq(cameraFrames.deviceId, deviceId)).limit(1)
    : await query.orderBy(desc(cameraFrames.receivedAt)).limit(1);
  if (!row) return null;
  const ageMs = Date.now() - row.receivedAt.getTime();
  return {
    deviceId: row.deviceId,
    width: row.width,
    height: row.height,
    seq: row.seq,
    stats: row.stats || {},
    receivedAt: row.receivedAt,
    ageS: Math.max(0, Math.round(ageMs / 1000)),
    live: ageMs < CAMERA_LIVE_MS,
    image: `data:image/jpeg;base64,${row.jpegBase64}`,
  };
}

export async function recordHeartbeat(db, deviceId, beat) {
  const now = new Date();
  const [previous] = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  const values = {
    firmware: beat.fw ?? null,
    lastSeenAt: now,
    rssi: beat.rssi ?? null,
    uptimeS: beat.uptimeS ?? null,
    freeHeap: beat.freeHeap ?? null,
    freePsram: beat.freePsram ?? null,
    scans: beat.scans ?? null,
    accepted: beat.accepted ?? null,
    rejected: beat.rejected ?? null,
    decodeFails: beat.decodeFails ?? null,
    httpErrors: beat.httpErrors ?? null,
    wifiReconnects: beat.wifiReconnects ?? null,
  };
  if (beat.boot) {
    values.lastBootAt = now;
    values.lastResetReason = beat.resetReason ?? null;
  }
  await db.insert(devices).values({ id: deviceId, ...values }).onConflictDoUpdate({ target: devices.id, set: values });

  const events = [{ deviceId, type: "heartbeat", detail: { uptimeS: beat.uptimeS ?? null, rssi: beat.rssi ?? null }, at: now }];
  if (beat.boot) {
    const reason = beat.resetReason || "unknown";
    events.push({ deviceId, type: CRASH_REASONS.has(reason) ? "crash" : "boot", detail: { resetReason: reason }, at: now });
  } else if (previous && (previous.uptimeS ?? 0) <= (beat.uptimeS ?? 0)) {
    // Same power-on session: counters only grow, so an increase is a new failure.
    const newHttpErrors = (beat.httpErrors ?? 0) - (previous.httpErrors ?? 0);
    const newWifiDrops = (beat.wifiReconnects ?? 0) - (previous.wifiReconnects ?? 0);
    if (newHttpErrors > 0) events.push({ deviceId, type: "http_error", detail: { count: newHttpErrors }, at: now });
    if (newWifiDrops > 0) events.push({ deviceId, type: "wifi_drop", detail: { count: newWifiDrops }, at: now });
  }
  await db.insert(deviceEvents).values(events);
  if (beat.prev?.scanId) await recordRoundTrip(db, deviceId, beat.prev);
}

export async function listDevices(db) {
  const rows = await db.select().from(devices);
  const now = Date.now();
  return rows
    .map((row) => ({
      id: row.id,
      firmware: row.firmware,
      lastSeenAt: row.lastSeenAt,
      online: row.lastSeenAt ? now - row.lastSeenAt.getTime() < DEVICE_ONLINE_MS : false,
      lastBootAt: row.lastBootAt,
      lastResetReason: row.lastResetReason,
      rssi: row.rssi,
      uptimeS: row.uptimeS,
      scans: row.scans,
      decodeFails: row.decodeFails,
      httpErrors: row.httpErrors,
      wifiReconnects: row.wifiReconnects,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
