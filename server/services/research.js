// Data for the study's statistical treatment: scan accuracy and response, notification
// response time, cycle success rate, ETA error (MAE) and reliability (MTBF).
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { manilaClock } from "../../src/lib/campus.js";
import { attendance, deviceEvents, notifications, scanLogs, students, trips } from "../db/schema.js";
import { toCsv } from "../http.js";
import { listDevices } from "./devices.js";

const ACCEPTED = new Set(["checked_in", "late", "checked_out"]);
const SCAN_NOTICE_TYPES = new Set(["check_in", "late", "check_out"]);
const FAILURE_TYPES = new Set(["crash", "wifi_drop", "http_error"]);
// Heartbeats arrive every 10 minutes; a longer gap means the scanner was off.
const HEARTBEAT_GAP_LIMIT_MS = 15 * 60 * 1000;

const round = (value, digits = 2) => (value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

export function describe(values) {
  const list = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  const n = list.length;
  if (n === 0) return { n: 0, mean: null, sd: null, min: null, max: null };
  const mean = list.reduce((sum, value) => sum + value, 0) / n;
  const sd = n > 1 ? Math.sqrt(list.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean: round(mean), sd: round(sd), min: round(Math.min(...list)), max: round(Math.max(...list)) };
}

export function resolveRange({ from, to }) {
  const today = manilaClock().dateKey;
  const valid = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : null);
  const end = valid(to) || today;
  let start = valid(from);
  if (!start) {
    const date = new Date(`${end}T00:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() - 29);
    start = manilaClock(date).dateKey;
  }
  return {
    from: start,
    to: end,
    startAt: new Date(`${start}T00:00:00+08:00`),
    endAt: new Date(`${end}T23:59:59.999+08:00`),
  };
}

async function loadRange(db, range) {
  const inRange = (column) => and(gte(column, range.startAt), lte(column, range.endAt));
  const [scanRows, noticeRows, tripRows, eventRows, dayRows] = await Promise.all([
    db.select().from(scanLogs).where(inRange(scanLogs.receivedAt)).orderBy(asc(scanLogs.receivedAt)),
    db.select().from(notifications).where(inRange(notifications.eventAt)).orderBy(asc(notifications.eventAt)),
    db.select().from(trips).where(inRange(trips.startedAt)).orderBy(asc(trips.startedAt)),
    db.select().from(deviceEvents).where(inRange(deviceEvents.at)).orderBy(asc(deviceEvents.at)),
    db
      .select({ day: attendance, student: students })
      .from(attendance)
      .innerJoin(students, eq(students.id, attendance.studentId))
      .where(and(gte(attendance.schoolDate, range.from), lte(attendance.schoolDate, range.to)))
      .orderBy(asc(attendance.schoolDate), asc(students.fullName)),
  ]);
  return { scanRows, noticeRows, tripRows, eventRows, dayRows };
}

const secondsBetween = (later, earlier) => (later && earlier ? (later - earlier) / 1000 : null);

export async function researchSummary(db, query) {
  const range = resolveRange(query);
  const { scanRows, noticeRows, tripRows, eventRows } = await loadRange(db, range);

  // Scan accuracy and response
  const counts = { accepted: 0, duplicate: 0, rejected: 0, error: 0 };
  const byReason = {};
  for (const scan of scanRows) {
    if (ACCEPTED.has(scan.result)) counts.accepted += 1;
    else if (scan.result === "duplicate") counts.duplicate += 1;
    else if (scan.result === "error") counts.error += 1;
    else counts.rejected += 1;
    if (scan.result === "rejected") byReason[scan.reason || "other"] = (byReason[scan.reason || "other"] || 0) + 1;
  }
  const total = scanRows.length;

  // Notification response time (event -> first arrival on the parent's phone)
  const delivered = noticeRows.filter((notice) => notice.deliveredAt);
  const byChannel = { push: 0, in_app: 0 };
  for (const notice of delivered) byChannel[notice.deliveredVia] = (byChannel[notice.deliveredVia] || 0) + 1;
  const byType = {};
  for (const notice of noticeRows) {
    const entry = (byType[notice.type] ||= { total: 0, delivered: 0, seconds: [] });
    entry.total += 1;
    if (notice.deliveredAt) {
      entry.delivered += 1;
      entry.seconds.push(secondsBetween(notice.deliveredAt, notice.eventAt));
    }
  }
  for (const entry of Object.values(byType)) {
    entry.responseSeconds = describe(entry.seconds);
    delete entry.seconds;
  }

  // Full cycle: valid scan -> status update -> parent notified
  const cycleNotices = noticeRows.filter((notice) => SCAN_NOTICE_TYPES.has(notice.type));
  const cyclesDone = cycleNotices.filter((notice) => notice.deliveredAt).length;

  // ETA accuracy
  const arrived = tripRows.filter((trip) => trip.status === "arrived" && trip.etaErrorMinutes != null);
  const errors = arrived.map((trip) => trip.etaErrorMinutes);
  const mae = errors.length ? errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length : null;
  const rmse = errors.length ? Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length) : null;

  // Reliability: operating time from heartbeats, failures from device events and server errors
  const heartbeatsByDevice = new Map();
  for (const event of eventRows) {
    if (event.type !== "heartbeat") continue;
    if (!heartbeatsByDevice.has(event.deviceId)) heartbeatsByDevice.set(event.deviceId, []);
    heartbeatsByDevice.get(event.deviceId).push(event.at.getTime());
  }
  let operatingMs = 0;
  for (const times of heartbeatsByDevice.values()) {
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      if (gap <= HEARTBEAT_GAP_LIMIT_MS) operatingMs += gap;
    }
  }
  const failureLog = [];
  for (const event of eventRows) {
    if (FAILURE_TYPES.has(event.type)) {
      failureLog.push({ at: event.at, source: event.deviceId, type: event.type, count: event.detail?.count || 1 });
    }
  }
  for (const scan of scanRows) {
    if (scan.result === "error") failureLog.push({ at: scan.receivedAt, source: "server", type: "scan_error", count: 1 });
  }
  failureLog.sort((a, b) => a.at - b.at);
  const failures = failureLog.reduce((sum, entry) => sum + entry.count, 0);
  const operatingHours = operatingMs / 3600000;

  return {
    range: { from: range.from, to: range.to },
    scans: {
      total,
      ...counts,
      byReason,
      processedWithoutErrorPct: total ? round(((total - counts.error) / total) * 100, 1) : null,
      serverMs: describe(scanRows.map((scan) => scan.processingMs)),
      deviceRoundTripMs: describe(scanRows.map((scan) => scan.deviceRoundTripMs)),
    },
    notifications: {
      total: noticeRows.length,
      delivered: delivered.length,
      deliveredPct: noticeRows.length ? round((delivered.length / noticeRows.length) * 100, 1) : null,
      responseSeconds: describe(delivered.map((notice) => secondsBetween(notice.deliveredAt, notice.eventAt))),
      byChannel,
      byType,
    },
    cycles: {
      total: cycleNotices.length,
      completed: cyclesDone,
      successPct: cycleNotices.length ? round((cyclesDone / cycleNotices.length) * 100, 1) : null,
    },
    eta: {
      trips: tripRows.length,
      arrived: arrived.length,
      stopped: tripRows.filter((trip) => trip.status === "stopped").length,
      maeMinutes: round(mae),
      meanErrorMinutes: errors.length ? round(errors.reduce((sum, value) => sum + value, 0) / errors.length) : null,
      rmseMinutes: round(rmse),
    },
    reliability: {
      operatingHours: round(operatingHours),
      failures,
      mtbfHours: failures > 0 ? round(operatingHours / failures) : null,
      failureLog: failureLog.slice(-50).reverse(),
    },
    devices: await listDevices(db),
  };
}

const iso = (value) => (value ? new Date(value).toISOString() : "");
const seconds = (later, earlier) => (later && earlier ? round((later - earlier) / 1000, 1) : "");

export async function researchCsv(db, query, type) {
  const range = resolveRange(query);
  const { scanRows, noticeRows, tripRows, eventRows, dayRows } = await loadRange(db, range);

  if (type === "scans") {
    return toCsv(scanRows, [
      { label: "scan_id", value: (r) => r.id },
      { label: "received_at", value: (r) => iso(r.receivedAt) },
      { label: "source", value: (r) => r.source },
      { label: "device_id", value: (r) => r.deviceId },
      { label: "student_id", value: (r) => r.studentId },
      { label: "action", value: (r) => r.action },
      { label: "result", value: (r) => r.result },
      { label: "reason", value: (r) => r.reason },
      { label: "late", value: (r) => r.late },
      { label: "http_status", value: (r) => r.httpStatus },
      { label: "server_ms", value: (r) => r.processingMs },
      { label: "device_round_trip_ms", value: (r) => r.deviceRoundTripMs },
    ]);
  }
  if (type === "notifications") {
    return toCsv(noticeRows, [
      { label: "notification_id", value: (r) => r.id },
      { label: "type", value: (r) => r.type },
      { label: "student_id", value: (r) => r.studentId },
      { label: "event_at", value: (r) => iso(r.eventAt) },
      { label: "created_at", value: (r) => iso(r.createdAt) },
      { label: "push_status", value: (r) => r.pushStatus },
      { label: "delivered_at", value: (r) => iso(r.deliveredAt) },
      { label: "delivered_via", value: (r) => r.deliveredVia },
      { label: "response_seconds", value: (r) => seconds(r.deliveredAt, r.eventAt) },
      { label: "read_at", value: (r) => iso(r.readAt) },
    ]);
  }
  if (type === "trips") {
    return toCsv(tripRows, [
      { label: "trip_id", value: (r) => r.id },
      { label: "student_id", value: (r) => r.studentId },
      { label: "school_date", value: (r) => r.schoolDate },
      { label: "status", value: (r) => r.status },
      { label: "started_at", value: (r) => iso(r.startedAt) },
      { label: "initial_distance_km", value: (r) => r.initialRemainingKm },
      { label: "initial_eta_minutes", value: (r) => r.initialEtaMinutes },
      { label: "predicted_arrival_at", value: (r) => iso(r.predictedArrivalAt) },
      { label: "arrived_at", value: (r) => iso(r.arrivedAt) },
      { label: "eta_error_minutes", value: (r) => r.etaErrorMinutes },
      { label: "ended_at", value: (r) => iso(r.endedAt) },
    ]);
  }
  if (type === "device-events") {
    return toCsv(eventRows, [
      { label: "event_id", value: (r) => r.id },
      { label: "device_id", value: (r) => r.deviceId },
      { label: "type", value: (r) => r.type },
      { label: "at", value: (r) => iso(r.at) },
      { label: "detail", value: (r) => (r.detail ? JSON.stringify(r.detail) : "") },
    ]);
  }

  // "trials": one row per student per school day, the full monitoring cycle side by side.
  const noticeFor = (studentId, typeNames, eventAt) =>
    noticeRows.find(
      (notice) =>
        notice.studentId === studentId &&
        typeNames.includes(notice.type) &&
        eventAt &&
        Math.abs(notice.eventAt - eventAt) < 1000,
    );
  const tripFor = (studentId, schoolDate) =>
    tripRows.filter((trip) => trip.studentId === studentId && trip.schoolDate === schoolDate).at(-1);
  const rows = dayRows.map(({ day, student }) => {
    const checkInNotice = noticeFor(student.id, ["check_in", "late"], day.checkInAt);
    const checkOutNotice = noticeFor(student.id, ["check_out"], day.checkOutAt);
    const trip = tripFor(student.id, day.schoolDate);
    const etaNotice = trip ? noticeFor(student.id, ["eta"], trip.startedAt) : null;
    const arrivalNotice = trip?.arrivedAt ? noticeFor(student.id, ["arrived_home"], trip.arrivedAt) : null;
    return { day, student, checkInNotice, checkOutNotice, trip, etaNotice, arrivalNotice };
  });
  return toCsv(rows, [
    { label: "school_date", value: (r) => r.day.schoolDate },
    { label: "student_number", value: (r) => r.student.studentNumber },
    { label: "student_name", value: (r) => r.student.fullName },
    { label: "grade_section", value: (r) => r.student.gradeSection },
    { label: "status", value: (r) => r.day.status },
    { label: "late", value: (r) => r.day.late },
    { label: "check_in_at", value: (r) => iso(r.day.checkInAt) },
    { label: "check_in_via", value: (r) => r.day.checkInVia },
    { label: "check_in_notified_at", value: (r) => iso(r.checkInNotice?.deliveredAt) },
    { label: "check_in_response_s", value: (r) => seconds(r.checkInNotice?.deliveredAt, r.day.checkInAt) },
    { label: "check_out_at", value: (r) => iso(r.day.checkOutAt) },
    { label: "check_out_via", value: (r) => r.day.checkOutVia },
    { label: "check_out_notified_at", value: (r) => iso(r.checkOutNotice?.deliveredAt) },
    { label: "check_out_response_s", value: (r) => seconds(r.checkOutNotice?.deliveredAt, r.day.checkOutAt) },
    { label: "trip_started_at", value: (r) => iso(r.trip?.startedAt) },
    { label: "eta_notified_at", value: (r) => iso(r.etaNotice?.deliveredAt) },
    { label: "eta_response_s", value: (r) => seconds(r.etaNotice?.deliveredAt, r.trip?.startedAt) },
    { label: "initial_distance_km", value: (r) => r.trip?.initialRemainingKm ?? "" },
    { label: "predicted_arrival_at", value: (r) => iso(r.trip?.predictedArrivalAt) },
    { label: "arrived_home_at", value: (r) => iso(r.day.arrivedHomeAt) },
    { label: "eta_error_minutes", value: (r) => r.trip?.etaErrorMinutes ?? "" },
    { label: "arrival_notified_at", value: (r) => iso(r.arrivalNotice?.deliveredAt) },
    { label: "cycle_complete", value: (r) => Boolean(r.day.checkInAt && r.checkInNotice?.deliveredAt) },
  ]);
}
