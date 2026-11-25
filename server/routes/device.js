// Endpoints for the ESP32-CAM gate scanner. Authenticated with the X-Device-Api-Key header.
import { Router } from "express";
import { z } from "zod";
import { manilaClock } from "../../src/lib/campus.js";
import { safeEqual } from "../auth.js";
import { getDb } from "../db/client.js";
import { verifyScan } from "../services/attendance.js";
import { recordHeartbeat, saveCameraFrame } from "../services/devices.js";
import { describeSettings, getSettings } from "../services/settings.js";

const router = Router();

function cleanDeviceId(value) {
  return String(value || "scanner").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40) || "scanner";
}

function requireDevice(req, res, next) {
  const expected = process.env.DEVICE_API_KEY;
  if (!expected) {
    return res.status(503).json({ ok: false, error: "Scanner key is not set on the server.", line1: "SETUP", line2: "Server has no device key", beep: "error" });
  }
  if (!safeEqual(req.get("x-device-api-key") || "", expected)) {
    return res.status(401).json({ ok: false, error: "Wrong device key.", line1: "BAD KEY", line2: "Check DEVICE_API_KEY", line3: "in secrets.h", beep: "error" });
  }
  req.deviceId = cleanDeviceId(req.get("x-device-id") || req.body?.deviceId);
  next();
}

const timing = z.object({ scanId: z.number().int().positive(), ms: z.number().min(0).max(120000) }).optional();

const scanSchema = z.object({
  token: z.string().max(300).default(""),
  action: z.enum(["auto", "in", "out"]).default("auto"),
  prev: timing,
});

// Same path and fields as the original firmware, so older sketches keep working.
router.post("/attendance/qr/verify", requireDevice, async (req, res) => {
  const parsed = scanSchema.safeParse(req.body ?? {});
  const input = parsed.success ? parsed.data : { token: "", action: "auto" };
  const result = await verifyScan(getDb(), {
    text: input.token,
    action: input.action,
    source: "device",
    deviceId: req.deviceId,
    prev: input.prev,
  });
  res.status(result.status).json(result.body);
});

router.get("/device/ping", requireDevice, async (req, res) => {
  const settings = describeSettings(await getSettings(getDb()));
  res.json({ ok: true, serverTime: new Date().toISOString(), manila: manilaClock().label, lateAfter: settings.lateAfterLabel });
});

const count = z.number().int().min(0).max(1e9).optional();
const heartbeatSchema = z.object({
  fw: z.string().max(20).optional(),
  boot: z.boolean().optional(),
  resetReason: z.string().max(40).optional(),
  uptimeS: count,
  rssi: z.number().int().min(-130).max(10).optional(),
  freeHeap: count,
  freePsram: count,
  scans: count,
  accepted: count,
  rejected: count,
  decodeFails: count,
  httpErrors: count,
  wifiReconnects: count,
  prev: timing,
});

router.post("/device/heartbeat", requireDevice, async (req, res) => {
  const parsed = heartbeatSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid heartbeat." });
  await recordHeartbeat(getDb(), req.deviceId, parsed.data);
  res.json({ ok: true });
});

// A camera picture for the teacher-only camera view (sent during the scanner's preview window).
const frameSchema = z.object({
  width: z.number().int().min(16).max(1600),
  height: z.number().int().min(16).max(1200),
  seq: z.number().int().min(0).max(1e9),
  // Base64 JPEG ("/9j/" is the JPEG start marker), at most ~150 KB of image data.
  jpeg: z.string().min(100).max(200000).regex(/^\/9j\/[A-Za-z0-9+/]+={0,2}$/),
  stats: z
    .object({
      frames: count,
      fps: z.number().min(0).max(100).optional(),
      found: count,
      read: count,
      decodeFails: count,
      lastError: z.string().max(60).optional(),
      scans: count,
      brightness: z.number().int().min(0).max(255).optional(),
      sharpness: z.number().int().min(0).max(100000).optional(),
      previewLeftS: count,
      uptimeS: count,
      rssi: z.number().int().min(-130).max(10).optional(),
      fw: z.string().max(20).optional(),
    })
    .optional(),
});

router.post("/device/snapshot", requireDevice, async (req, res) => {
  const parsed = frameSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid camera picture." });
  await saveCameraFrame(getDb(), req.deviceId, parsed.data);
  res.json({ ok: true });
});

export default router;
