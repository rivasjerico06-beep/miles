import { randomBytes } from "node:crypto";
import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { manilaClock } from "../../src/lib/campus.js";
import { requireRole, sha256, studentForUser } from "../auth.js";
import { getDb } from "../db/client.js";
import { attendance, sosAlerts, students, users } from "../db/schema.js";
import { fail, parse, tooManyAttempts } from "../http.js";
import { getAttendance, getTodayPass, passQrText } from "../services/attendance.js";
import { describeSettings, getSettings } from "../services/settings.js";
import { latestTrip, startTrip, stopTrip, triggerSos, updatePosition } from "../services/trips.js";
import { alertView, dayView, tripView } from "./views.js";

const router = Router();
router.use(requireRole("student"));

const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
const LINK_CODE_DAYS = 3;

export function normalizeLinkCode(value) {
  const clean = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 8 ? clean : null;
}

const point = z.object({
  lat: z.number({ error: "Location is missing." }).min(-90).max(90),
  lng: z.number({ error: "Location is missing." }).min(-180).max(180),
  accuracy: z.number().min(0).max(100000).nullish(),
});

async function currentStudent(req) {
  const student = await studentForUser(req.user.id);
  if (!student) fail(404, "Your student record is missing. Please contact the school office.");
  return student;
}

router.get("/dashboard", async (req, res) => {
  const db = getDb();
  const student = await currentStudent(req);
  const clock = manilaClock();
  const [pass, today, trip, history, alerts, parents, settings] = await Promise.all([
    getTodayPass(db, student.id, clock.dateKey),
    getAttendance(db, student.id, clock.dateKey),
    latestTrip(db, student.id, clock.dateKey),
    db.select().from(attendance).where(eq(attendance.studentId, student.id)).orderBy(desc(attendance.schoolDate)).limit(20),
    db.select().from(sosAlerts).where(eq(sosAlerts.studentId, student.id)).orderBy(desc(sosAlerts.createdAt)).limit(5),
    student.parentUserId
      ? db.select({ fullName: users.fullName }).from(users).where(eq(users.id, student.parentUserId)).limit(1)
      : Promise.resolve([]),
    getSettings(db),
  ]);
  res.json({
    student: {
      id: student.id,
      fullName: student.fullName,
      studentNumber: student.studentNumber,
      gradeSection: student.gradeSection,
      homeLat: student.homeLat,
      homeLng: student.homeLng,
      homeUpdatedAt: student.homeUpdatedAt,
      parentLinked: Boolean(student.parentUserId),
      parentName: parents[0]?.fullName || "",
      linkCodeExpiresAt: student.linkCodeExpiresAt > new Date() ? student.linkCodeExpiresAt : null,
    },
    pass: {
      qrText: passQrText(pass),
      schoolDate: pass.schoolDate,
      checkedInAt: pass.checkedInAt,
      checkedOutAt: pass.checkedOutAt,
    },
    today: dayView(today),
    trip: tripView(trip),
    history: history.map(dayView),
    alerts: alerts.map(alertView),
    clock,
    settings: describeSettings(settings),
  });
});

router.post("/home", async (req, res) => {
  const input = parse(point, req.body);
  const student = await currentStudent(req);
  await getDb()
    .update(students)
    .set({ homeLat: input.lat, homeLng: input.lng, homeUpdatedAt: new Date() })
    .where(eq(students.id, student.id));
  res.json({ ok: true });
});

// One-time code the parent enters when creating their account (links the two accounts).
router.post("/link-code", async (req, res) => {
  const student = await currentStudent(req);
  if (student.parentUserId) fail(409, "A parent account is already linked to you.");
  const bytes = randomBytes(8);
  const code = Array.from(bytes, (byte) => LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length]).join("");
  const expiresAt = new Date(Date.now() + LINK_CODE_DAYS * 24 * 60 * 60 * 1000);
  await getDb()
    .update(students)
    .set({ linkCodeHash: sha256(code), linkCodeExpiresAt: expiresAt })
    .where(eq(students.id, student.id));
  res.json({ code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt });
});

router.post("/trip/start", async (req, res) => {
  const input = parse(point, req.body);
  const student = await currentStudent(req);
  res.json(await startTrip(getDb(), student, input));
});

router.post("/trip/position", async (req, res) => {
  const input = parse(point, req.body);
  const student = await currentStudent(req);
  res.json(await updatePosition(getDb(), student, input));
});

router.post("/trip/stop", async (req, res) => {
  const student = await currentStudent(req);
  res.json(await stopTrip(getDb(), student));
});

router.post("/sos", async (req, res) => {
  const input = parse(point.partial(), req.body);
  if (tooManyAttempts(`sos:${req.user.id}`, 6, 10 * 60 * 1000)) fail(429, "SOS was sent several times already. Call for help directly if you can.");
  const student = await currentStudent(req);
  res.json(await triggerSos(getDb(), student, input));
});

export default router;
