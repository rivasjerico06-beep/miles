// Gate passes and the check-in / check-out rules from the study. Each student has one pass per
// school day, shown as a QR code that works for only 3 minutes; after that the app gets a new code.
// The server checks that a scanned code exists, belongs to a student, is from today, is less than
// 3 minutes old and has not been used for that entry. The first valid scan is the check-in (late
// after the cut-off time), the next one is the check-out, and anything after that is rejected.
import { randomBytes } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import { formatManilaTime, manilaClock, minutesFromHHMM } from "../../src/lib/campus.js";
import { attendance, dailyPasses, scanLogs, students } from "../db/schema.js";
import { notifyParent } from "./notify.js";
import { getSettings } from "./settings.js";

export const PASS_PREFIX = "CP1:";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// How long one QR code works. The app shows a new code when it runs out, so a screenshot or a
// code sent to a friend stops working within minutes.
export const PASS_CODE_MINUTES = 3;
const PASS_CODE_MS = PASS_CODE_MINUTES * 60 * 1000;

// 12 random bytes -> 20 base32 characters. "CP1:" + 20 characters fits a version-1 QR code
// (21 x 21 modules), the easiest size for the ESP32-CAM to read from a phone screen.
export function newPassToken() {
  const bytes = randomBytes(12);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function parsePassText(text) {
  const clean = String(text || "").trim().toUpperCase();
  const match = /^(?:CP1:)?([A-Z2-7]{20})$/.exec(clean);
  return match ? match[1] : null;
}

export function passQrText(pass) {
  return PASS_PREFIX + pass.token;
}

export function passCodeExpiresAt(pass) {
  return new Date(new Date(pass.tokenIssuedAt).getTime() + PASS_CODE_MS);
}

export function passCodeExpired(pass, now = new Date()) {
  return now.getTime() >= passCodeExpiresAt(pass).getTime();
}

// Today's pass with a code less than 3 minutes old: an expired code is replaced by a new one.
// The replaced code is kept as previousToken, so scanning it answers EXPIRED, not "not recognized".
// A pass already used for both entries keeps its last code, since there is nothing left to scan.
export async function getTodayPass(db, studentId, dateKey, now = new Date()) {
  const find = async () => {
    const [row] = await db
      .select()
      .from(dailyPasses)
      .where(and(eq(dailyPasses.studentId, studentId), eq(dailyPasses.schoolDate, dateKey)))
      .limit(1);
    return row;
  };
  let pass = await find();
  if (!pass) {
    const [created] = await db
      .insert(dailyPasses)
      .values({ studentId, schoolDate: dateKey, token: newPassToken(), tokenIssuedAt: now })
      .onConflictDoNothing()
      .returning();
    pass = created ?? (await find());
  }
  if (pass && passCodeExpired(pass, now) && !(pass.checkedInAt && pass.checkedOutAt)) {
    const [renewed] = await db
      .update(dailyPasses)
      .set({ token: newPassToken(), previousToken: pass.token, tokenIssuedAt: now })
      .where(and(eq(dailyPasses.id, pass.id), eq(dailyPasses.token, pass.token)))
      .returning();
    pass = renewed ?? (await find()); // another request renewed it at the same moment
  }
  return pass;
}

export async function getAttendance(db, studentId, dateKey) {
  const [row] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.studentId, studentId), eq(attendance.schoolDate, dateKey)))
    .limit(1);
  return row ?? null;
}

export async function saveAttendance(db, studentId, dateKey, values) {
  const now = new Date();
  await db
    .insert(attendance)
    .values({ studentId, schoolDate: dateKey, status: values.status, ...values, updatedAt: now })
    .onConflictDoUpdate({
      target: [attendance.studentId, attendance.schoolDate],
      set: { ...values, updatedAt: now },
    });
}

export function firstName(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "Your child";
}

// The OLED shows plain ASCII only: "Niño" -> "Nino".
function oledText(value, max) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .trim()
    .slice(0, max);
}

function reply(status, fields) {
  return {
    status,
    body: {
      ok: status >= 200 && status < 300,
      ...fields,
      line1: oledText(fields.line1, 10),
      line2: oledText(fields.line2, 42),
      line3: oledText(fields.line3, 21),
    },
  };
}

function rejection(status, reason, { message, line1, line2, line3, student }) {
  return {
    ...reply(status, {
      result: "rejected",
      reason,
      error: message,
      message,
      studentName: student?.fullName || "",
      line1,
      line2,
      line3,
      beep: "error",
    }),
    student,
  };
}

/**
 * Verifies a scanned pass and records the check-in or check-out.
 * source: "device" (ESP32-CAM) or "teacher" (backup scanner on a teacher's phone).
 * Returns { status, body } where body is what the scanner shows.
 */
export async function verifyScan(db, { text, action = "auto", source, deviceId, prev }) {
  const started = Date.now();
  const clock = manilaClock();
  let outcome;
  try {
    const token = parsePassText(text);
    if (!token) {
      outcome = rejection(422, "invalid_format", {
        message: "This is not a CampusPulse gate pass.",
        line1: "INVALID QR",
        line2: "Not a CampusPulse pass",
        line3: "Open the app's pass",
      });
    } else {
      const [row] = await db
        .select({ pass: dailyPasses, student: students })
        .from(dailyPasses)
        .innerJoin(students, eq(students.id, dailyPasses.studentId))
        .where(or(eq(dailyPasses.token, token), eq(dailyPasses.previousToken, token)))
        .limit(1);
      if (!row) {
        outcome = rejection(404, "unknown_code", {
          message: "This QR code is not recognized.",
          line1: "INVALID QR",
          line2: "Code not recognized",
          line3: "Open today's pass",
        });
      } else if (row.pass.schoolDate !== clock.dateKey) {
        outcome = rejection(410, "expired", {
          message: "This pass is from another day. Refresh the app to get today's pass.",
          line1: "EXPIRED",
          line2: row.student.fullName,
          line3: "Refresh the app pass",
          student: row.student,
        });
      } else if (row.pass.token !== token || passCodeExpired(row.pass)) {
        outcome = rejection(410, "code_expired", {
          message: `This QR code has expired. Each code works for ${PASS_CODE_MINUTES} minutes; scan the new code in the app.`,
          line1: "EXPIRED",
          line2: row.student.fullName,
          line3: "Scan the new code",
          student: row.student,
        });
      } else {
        outcome = await applyScan(db, row, { action, source, deviceId, clock });
      }
    }
  } catch (error) {
    console.error("[scan]", error);
    outcome = {
      ...reply(500, {
        result: "error",
        reason: "server_error",
        error: "The server could not record this scan.",
        message: "The server could not record this scan.",
        line1: "ERROR",
        line2: "Server problem",
        line3: "Please scan again",
        beep: "error",
      }),
    };
  }

  let scanId = null;
  try {
    const [log] = await db
      .insert(scanLogs)
      .values({
        source,
        deviceId: deviceId || null,
        studentId: outcome.student?.id ?? null,
        action: outcome.action ?? null,
        result: outcome.body.result,
        reason: outcome.body.reason ?? null,
        late: outcome.late ?? null,
        httpStatus: outcome.status,
        processingMs: Date.now() - started,
      })
      .returning({ id: scanLogs.id });
    scanId = log.id;
    if (prev?.scanId && deviceId) await recordRoundTrip(db, deviceId, prev);
  } catch (error) {
    console.error("[scan-log]", error);
  }
  return { status: outcome.status, body: { ...outcome.body, scanId } };
}

// The scanner measures how long each scan took (decode -> answer on screen) and sends it with its next request.
export async function recordRoundTrip(db, deviceId, prev) {
  const ms = Math.round(Number(prev.ms));
  const scanId = Number(prev.scanId);
  if (!Number.isInteger(scanId) || !Number.isFinite(ms) || ms < 0 || ms > 120000) return;
  await db
    .update(scanLogs)
    .set({ deviceRoundTripMs: ms })
    .where(and(eq(scanLogs.id, scanId), eq(scanLogs.deviceId, deviceId)));
}

async function applyScan(db, { pass, student }, { action, source, deviceId, clock }) {
  const settings = await getSettings(db);
  const now = new Date();
  const via = source === "device" ? deviceId || "scanner" : "teacher-phone";
  const repeatWindowMs = settings.minCheckoutMinutes * 60 * 1000;
  const name = student.fullName;
  const time = formatManilaTime(now);

  // ----- Check-in -----
  if (!pass.checkedInAt) {
    if (action === "out") {
      return rejection(409, "not_checked_in", {
        message: `${name} has not checked in yet today.`,
        line1: "NOT IN YET",
        line2: name,
        line3: "Scan in first",
        student,
      });
    }
    const [claimed] = await db
      .update(dailyPasses)
      .set({ checkedInAt: now })
      .where(and(eq(dailyPasses.id, pass.id), isNull(dailyPasses.checkedInAt)))
      .returning();
    if (!claimed) return repeatScan(student, "in", now);

    const late = clock.minutes > minutesFromHHMM(settings.lateAfter);
    await saveAttendance(db, student.id, clock.dateKey, {
      status: late ? "late" : "on_campus",
      late,
      checkInAt: now,
      checkInVia: via,
    });
    await notifyParent(db, student, {
      type: late ? "late" : "check_in",
      title: late ? `${firstName(name)} arrived late` : `${firstName(name)} is in class`,
      body: late
        ? `Checked in at ${time}, after the ${formatManilaTime(lateCutoffDate(settings))} cut-off.`
        : `Checked in on time at ${time}.`,
      eventAt: now,
    });
    return {
      ...reply(200, {
        result: late ? "late" : "checked_in",
        studentName: name,
        status: late ? "Late" : "On Campus",
        remark: late ? "Late" : "On Time",
        time,
        message: late ? `${name} checked in late at ${time}.` : `${name} checked in on time at ${time}.`,
        line1: late ? "LATE" : "CHECKED IN",
        line2: name,
        line3: late ? `Late - in at ${time}` : `On time - ${time}`,
        beep: late ? "late" : "ok",
      }),
      student,
      action: "in",
      late,
    };
  }

  // ----- Check-out -----
  if (!pass.checkedOutAt) {
    if (action === "in" || now - pass.checkedInAt < repeatWindowMs) {
      return repeatScan(student, "in", pass.checkedInAt);
    }
    const [claimed] = await db
      .update(dailyPasses)
      .set({ checkedOutAt: now })
      .where(and(eq(dailyPasses.id, pass.id), isNull(dailyPasses.checkedOutAt)))
      .returning();
    if (!claimed) return repeatScan(student, "out", now);

    await saveAttendance(db, student.id, clock.dateKey, { status: "checked_out", checkOutAt: now, checkOutVia: via });
    await notifyParent(db, student, {
      type: "check_out",
      title: `${firstName(name)} checked out`,
      body: `Left class at ${time}. Live location and ETA appear once their phone starts the trip home.`,
      eventAt: now,
    });
    return {
      ...reply(200, {
        result: "checked_out",
        studentName: name,
        status: "Checked Out",
        remark: "Checked Out",
        time,
        message: `${name} checked out at ${time}.`,
        line1: "CHECK-OUT",
        line2: name,
        line3: `Out at ${time}`,
        beep: "out",
      }),
      student,
      action: "out",
    };
  }

  // ----- Pass already used for both entries -----
  if (now - pass.checkedOutAt < repeatWindowMs) return repeatScan(student, "out", pass.checkedOutAt);
  return rejection(409, "already_used", {
    message: "This pass was already used for today's check-in and check-out.",
    line1: "USED PASS",
    line2: name,
    line3: "New pass tomorrow",
    student,
  });
}

// The same pass scanned again right away: confirm it without recording anything new.
function repeatScan(student, entry, at) {
  const time = formatManilaTime(at);
  return {
    ...reply(200, {
      result: "duplicate",
      reason: entry === "in" ? "already_checked_in" : "already_checked_out",
      studentName: student.fullName,
      status: entry === "in" ? "On Campus" : "Checked Out",
      remark: entry === "in" ? "Already checked in" : "Already checked out",
      time,
      message: `${student.fullName} was already ${entry === "in" ? "checked in" : "checked out"} at ${time}.`,
      line1: "RECORDED",
      line2: student.fullName,
      line3: `Already ${entry === "in" ? "in" : "out"} ${time}`,
      beep: "ok",
    }),
    student,
  };
}

function lateCutoffDate(settings) {
  const minutes = minutesFromHHMM(settings.lateAfter);
  const clock = manilaClock();
  return new Date(`${clock.dateKey}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+08:00`);
}
