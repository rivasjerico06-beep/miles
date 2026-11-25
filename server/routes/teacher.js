import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { manilaClock, minutesFromHHMM, normalizeSection, sameSection } from "../../src/lib/campus.js";
import { requireRole } from "../auth.js";
import { getDb } from "../db/client.js";
import { attendance, students, users } from "../db/schema.js";
import { fail, parse } from "../http.js";
import { verifyScan } from "../services/attendance.js";
import { latestCameraFrame, listDevices } from "../services/devices.js";
import { researchCsv, researchSummary } from "../services/research.js";
import { describeSettings, getSettings, saveSettings } from "../services/settings.js";
import { dayView } from "./views.js";

const router = Router();
router.use(requireRole("teacher"));

// Attendance only: teachers never receive student locations, home pins or ETAs.
router.get("/dashboard", async (req, res) => {
  const db = getDb();
  const advisory = req.user.gradeSection || "";
  const scope = req.query.scope === "all" || !advisory ? "all" : "advisory";
  const clock = manilaClock();
  const [studentRows, dayRows, settings, devices] = await Promise.all([
    db
      .select({ id: students.id, fullName: students.fullName, studentNumber: students.studentNumber, gradeSection: students.gradeSection, parentUserId: students.parentUserId })
      .from(students)
      .orderBy(asc(students.fullName)),
    db.select().from(attendance).where(eq(attendance.schoolDate, clock.dateKey)),
    getSettings(db),
    listDevices(db),
  ]);
  const byStudent = new Map(dayRows.map((row) => [row.studentId, dayView(row)]));
  const rows = studentRows
    .filter((student) => scope === "all" || sameSection(student.gradeSection, advisory))
    .map((student) => {
      const day = byStudent.get(student.id);
      return {
        studentNumber: student.studentNumber,
        fullName: student.fullName,
        gradeSection: student.gradeSection,
        parentLinked: Boolean(student.parentUserId),
        status: day?.status || "Unaccounted",
        late: day?.late || false,
        checkInAt: day?.checkInAt || null,
        checkInVia: day?.checkInVia || "",
        checkOutAt: day?.checkOutAt || null,
        checkOutVia: day?.checkOutVia || "",
      };
    });
  const count = (...statuses) => rows.filter((row) => statuses.includes(row.status)).length;
  res.json({
    rows,
    counts: {
      onCampus: count("On Campus"),
      late: count("Late"),
      checkedOut: count("Checked Out", "Arrived Home"),
      unaccounted: count("Unaccounted"),
      total: rows.length,
    },
    clock,
    advisory,
    scope,
    settings: describeSettings(settings),
    devices,
  });
});

const settingsSchema = z.object({
  lateAfter: z
    .string()
    .refine((value) => minutesFromHHMM(value) !== null, "Enter the late cut-off as a time, e.g. 07:01.")
    .optional(),
  minCheckoutMinutes: z.number().int().min(0, "Use 0 to 240 minutes.").max(240, "Use 0 to 240 minutes.").optional(),
  avgSpeedKmh: z.number().min(4, "Use 4 to 60 km/h.").max(60, "Use 4 to 60 km/h.").optional(),
});

router.post("/settings", async (req, res) => {
  const input = parse(settingsSchema, req.body);
  if (input.lateAfter) {
    const minutes = minutesFromHHMM(input.lateAfter);
    input.lateAfter = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const settings = await saveSettings(getDb(), input, req.user.id);
  res.json({ settings: describeSettings(settings) });
});

router.post("/advisory", async (req, res) => {
  const { gradeSection } = parse(z.object({ gradeSection: z.string().max(80) }), req.body);
  const section = normalizeSection(gradeSection);
  if (!section) fail(400, "Choose the grade and section you handle.");
  await getDb().update(users).set({ gradeSection: section }).where(eq(users.id, req.user.id));
  res.json({ ok: true, gradeSection: section });
});

// Backup scanner on a teacher's phone camera, for when the ESP32-CAM is unavailable.
router.post("/scan", async (req, res) => {
  const { text } = parse(z.object({ text: z.string().min(1).max(300) }), req.body);
  const result = await verifyScan(getDb(), { text, action: "auto", source: "teacher", deviceId: `teacher-${req.user.id}` });
  res.json(result.body);
});

// Teacher-only camera view: the newest picture a scanner sent during its preview window.
router.get("/camera", async (req, res) => {
  const db = getDb();
  const deviceId = typeof req.query.device === "string" ? req.query.device.slice(0, 40) : "";
  const [frame, devices] = await Promise.all([latestCameraFrame(db, deviceId || null), listDevices(db)]);
  res.json({ frame, devices, serverTime: new Date().toISOString() });
});

router.get("/research", async (req, res) => {
  res.json(await researchSummary(getDb(), { from: req.query.from, to: req.query.to }));
});

const EXPORTS = new Set(["trials", "scans", "notifications", "trips", "device-events"]);
router.get("/research/export", async (req, res) => {
  const type = EXPORTS.has(req.query.type) ? req.query.type : "trials";
  const csv = await researchCsv(getDb(), { from: req.query.from, to: req.query.to }, type);
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="campuspulse-${type}-${manilaClock().dateKey}.csv"`);
  res.send("﻿" + csv);
});

export default router;
