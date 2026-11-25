// End-to-end API test on an in-memory Postgres (PGlite): the full monitoring cycle from the study.
// Run with: npm test
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";

process.env.DEVICE_API_KEY = "test-device-key";
process.env.TEACHER_SIGNUP_CODE = "ACN-TEST-CODE";
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

const { setDb } = await import("../server/db/client.js");
const { createLocalDb } = await import("../server/db/local.js");
const schema = await import("../server/db/schema.js");
const { flushBackground } = await import("../server/http.js");
const { estimateEta } = await import("../server/services/trips.js");
const { clearSettingsCache } = await import("../server/services/settings.js");

let local;
let server;
let base;

before(async () => {
  local = await createLocalDb(undefined);
  setDb(local.db);
  const { createApp } = await import("../server/app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await flushBackground();
  server?.close();
  await local?.close();
});

function client() {
  let cookie = "";
  async function call(method, path, body, headers = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = response.headers.getSetCookie?.() || [];
    for (const line of setCookie) {
      const pair = line.split(";")[0];
      cookie = pair.endsWith("=") ? "" : pair;
    }
    const type = response.headers.get("content-type") || "";
    const data = type.includes("json") ? await response.json() : await response.text();
    return { status: response.status, data };
  }
  return {
    get: (path, headers) => call("GET", path, undefined, headers),
    post: (path, body = {}, headers) => call("POST", path, body, headers),
  };
}

const device = (body, key = "test-device-key") =>
  fetch(`${base}/api/attendance/qr/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-api-key": key, "x-device-id": "gate-1" },
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, data: await response.json() }));

const teacher = client();
const student = client();
const parent = client();
const student2 = client();

test("teacher sign-up needs the access code", async () => {
  const wrong = await teacher.post("/api/auth/register", {
    role: "teacher", fullName: "Ana Reyes", email: "teacher@school.test", password: "password123",
    gradeSection: "12 - Leonhard Euler", teacherCode: "nope",
  });
  assert.equal(wrong.status, 403);
  const ok = await teacher.post("/api/auth/register", {
    role: "teacher", fullName: "Ana Reyes", email: "teacher@school.test", password: "password123",
    gradeSection: "12 - Leonhard Euler", teacherCode: "acn-test-code",
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.user.role, "teacher");
  const settings = await teacher.post("/api/teacher/settings", { lateAfter: "23:59", minCheckoutMinutes: 0, avgSpeedKmh: 20 });
  assert.equal(settings.status, 200, JSON.stringify(settings.data));
  assert.equal(settings.data.settings.lateAfter, "23:59");
});

test("student registers and gets a daily one-time QR pass", async () => {
  const bad = await student.post("/api/auth/register", {
    role: "student", fullName: "Juan Dela Cruz", email: "juan@school.test", password: "short",
    studentNumber: "2026-0001", gradeSection: "12 - Leonhard Euler",
  });
  assert.equal(bad.status, 400);
  const ok = await student.post("/api/auth/register", {
    role: "student", fullName: "Juan Dela Cruz", email: "juan@school.test", password: "password123",
    studentNumber: "2026-0001", gradeSection: "12 - Leonhard Euler",
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const dash = await student.get("/api/student/dashboard");
  assert.equal(dash.status, 200);
  assert.match(dash.data.pass.qrText, /^CP1:[A-Z2-7]{20}$/);
  assert.equal(dash.data.today, null);
  const again = await student.get("/api/student/dashboard");
  assert.equal(again.data.pass.qrText, dash.data.pass.qrText, "same pass all day");
});

test("parent links only with the student's link code", async () => {
  const noCode = await parent.post("/api/auth/register", {
    role: "parent", fullName: "Maria Dela Cruz", email: "maria@school.test", password: "password123",
    childStudentNumber: "2026-0001", linkCode: "AAAA-BBBB",
  });
  assert.equal(noCode.status, 400);
  const code = await student.post("/api/student/link-code");
  assert.equal(code.status, 200);
  assert.match(code.data.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const ok = await parent.post("/api/auth/register", {
    role: "parent", fullName: "Maria Dela Cruz", email: "maria@school.test", password: "password123",
    childStudentNumber: "2026-0001", linkCode: code.data.code.toLowerCase(),
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const intruder = client();
  const second = await intruder.post("/api/auth/register", {
    role: "parent", fullName: "Someone Else", email: "other@school.test", password: "password123",
    childStudentNumber: "2026-0001", linkCode: code.data.code,
  });
  assert.equal(second.status, 409);
  const roleGuard = await parent.get("/api/teacher/dashboard");
  assert.equal(roleGuard.status, 403);
});

test("scanner: wrong key, invalid and unknown codes are rejected", async () => {
  assert.equal((await device({ token: "x" }, "wrong")).status, 401);
  const invalid = await device({ token: "hello world" });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.data.line1, "INVALID QR");
  const unknown = await device({ token: "CP1:AAAAAAAAAAAAAAAAAAAA" });
  assert.equal(unknown.status, 404);
});

test("full cycle: check-in -> parent notified -> check-out -> used pass", async () => {
  const pass = (await student.get("/api/student/dashboard")).data.pass.qrText;

  const checkIn = await device({ token: pass, action: "auto" });
  assert.equal(checkIn.status, 200, JSON.stringify(checkIn.data));
  assert.equal(checkIn.data.result, "checked_in");
  assert.equal(checkIn.data.line1, "CHECKED IN");
  assert.equal(checkIn.data.beep, "ok");
  assert.ok(checkIn.data.scanId > 0);

  const parentView = await parent.get("/api/parent/dashboard");
  assert.equal(parentView.status, 200);
  assert.equal(parentView.data.today.status, "On Campus");
  assert.equal(parentView.data.notices[0].type, "check_in");
  const [notice] = await local.db.select().from(schema.notifications).where(eq(schema.notifications.type, "check_in"));
  assert.ok(notice.deliveredAt, "in-app delivery time recorded");
  assert.equal(notice.deliveredVia, "in_app");

  const checkOut = await device({ token: pass, prev: { scanId: checkIn.data.scanId, ms: 1234 } });
  assert.equal(checkOut.data.result, "checked_out", JSON.stringify(checkOut.data));
  const [log] = await local.db.select().from(schema.scanLogs).where(eq(schema.scanLogs.id, checkIn.data.scanId));
  assert.equal(log.deviceRoundTripMs, 1234, "scan response time stored");

  const used = await device({ token: pass });
  assert.equal(used.status, 409);
  assert.equal(used.data.reason, "already_used");
});

test("repeat scans right after check-in are confirmed, not counted twice", async () => {
  await teacher.post("/api/teacher/settings", { minCheckoutMinutes: 5 });
  clearSettingsCache();
  const reg = await student2.post("/api/auth/register", {
    role: "student", fullName: "José Niño", email: "jose@school.test", password: "password123",
    studentNumber: "2026-0002", gradeSection: "11 - Albert Einstein",
  });
  assert.equal(reg.status, 201);
  await teacher.post("/api/teacher/settings", { lateAfter: "00:00" });
  clearSettingsCache();
  const pass = (await student2.get("/api/student/dashboard")).data.pass.qrText;
  const late = await device({ token: pass });
  assert.equal(late.data.result, "late");
  assert.equal(late.data.line1, "LATE");
  assert.equal(late.data.line2, "Jose Nino", "ASCII only for the OLED");
  const repeat = await device({ token: pass });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.data.result, "duplicate");
  await teacher.post("/api/teacher/settings", { lateAfter: "23:59", minCheckoutMinutes: 0 });
  clearSettingsCache();
});

test("old passes are rejected as expired", async () => {
  const [row] = await local.db
    .update(schema.dailyPasses)
    .set({ schoolDate: "2020-01-01" })
    .where(eq(schema.dailyPasses.studentId, 2))
    .returning();
  const expired = await device({ token: `CP1:${row.token}` });
  assert.equal(expired.status, 410);
  assert.equal(expired.data.reason, "expired");
});

test("trip home: ETA notification, live updates and arrival", async () => {
  const noHome = await student.post("/api/student/trip/start", { lat: 14.6288, lng: 121.2254 });
  assert.equal(noHome.status, 400);
  const home = { lat: 14.5869, lng: 121.1753 }; // a few km from the school
  assert.equal((await student.post("/api/student/home", home)).status, 200);

  const start = await student.post("/api/student/trip/start", { lat: 14.6288, lng: 121.2254, accuracy: 10 });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  assert.equal(start.data.arrived, false);
  assert.ok(start.data.etaMinutes > 5);

  const mid = await student.post("/api/student/trip/position", { lat: 14.605, lng: 121.2, accuracy: 15 });
  assert.equal(mid.data.arrived, false);
  assert.ok(mid.data.remainingKm < start.data.remainingKm);

  const arrive = await student.post("/api/student/trip/position", { lat: home.lat + 0.0002, lng: home.lng, accuracy: 12 });
  assert.equal(arrive.data.arrived, true, JSON.stringify(arrive.data));

  const view = await parent.get("/api/parent/dashboard");
  const types = view.data.notices.map((notice) => notice.type);
  assert.ok(types.includes("eta") && types.includes("arrived_home"), types.join(","));
  assert.equal(view.data.today.status, "Arrived Home");
  assert.equal(view.data.trip.status, "arrived");
  assert.ok(view.data.trip.path.length >= 2);
  const [trip] = await local.db.select().from(schema.trips);
  assert.equal(typeof trip.etaErrorMinutes, "number");
});

test("SOS reaches the parent with a location, and the parent can resolve it", async () => {
  const sos = await student.post("/api/student/sos", {});
  assert.equal(sos.status, 200, JSON.stringify(sos.data));
  assert.equal(sos.data.locationSource, "last_known");
  const view = await parent.get("/api/parent/dashboard");
  assert.equal(view.data.notices[0].type, "sos");
  assert.ok(view.data.notices[0].mapsUrl);
  const resolved = await parent.post(`/api/parent/sos/${view.data.alerts[0].id}/resolve`);
  assert.equal(resolved.status, 200);
});

test("teacher sees attendance only, never locations", async () => {
  const dash = await teacher.get("/api/teacher/dashboard?scope=all");
  assert.equal(dash.status, 200);
  assert.equal(dash.data.counts.total, 2);
  const text = JSON.stringify(dash.data);
  assert.ok(!/homeLat|lastLat|"lat"/.test(text), "no location fields");
  const backup = await teacher.post("/api/teacher/scan", { text: "not a pass" });
  assert.equal(backup.status, 200);
  assert.equal(backup.data.ok, false);
});

test("scanner heartbeat and research data", async () => {
  const beat = await fetch(`${base}/api/device/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-api-key": "test-device-key", "x-device-id": "gate-1" },
    body: JSON.stringify({ fw: "2.0.0", boot: true, resetReason: "power_on", uptimeS: 5, rssi: -60, scans: 0, httpErrors: 0, wifiReconnects: 0 }),
  });
  assert.equal(beat.status, 200);
  const ping = await fetch(`${base}/api/device/ping`, { headers: { "x-device-api-key": "test-device-key" } });
  assert.equal(ping.status, 200);

  const summary = await teacher.get("/api/teacher/research");
  assert.equal(summary.status, 200, JSON.stringify(summary.data));
  assert.ok(summary.data.scans.total >= 7);
  assert.ok(summary.data.notifications.total >= 5);
  assert.equal(summary.data.eta.arrived, 1);
  assert.equal(summary.data.devices[0].id, "gate-1");

  const csv = await teacher.get("/api/teacher/research/export?type=trials");
  assert.equal(csv.status, 200);
  assert.match(csv.data, /school_date,student_number,student_name/);
});

test("scanner camera pictures reach the teacher-only camera view", async () => {
  const send = (body, key = "test-device-key") =>
    fetch(`${base}/api/device/snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-api-key": key, "x-device-id": "gate-1" },
      body: JSON.stringify(body),
    });
  const jpeg = "/9j/" + "A".repeat(4000);
  const frame = { width: 640, height: 480, seq: 7, jpeg, stats: { frames: 120, fps: 1.2, found: 3, read: 1, decodeFails: 2, lastError: "ECC failure", brightness: 128, sharpness: 54, fw: "2.0.5" } };

  assert.equal((await send(frame, "wrong-key")).status, 401);
  assert.equal((await send({ ...frame, jpeg: "not a jpeg" })).status, 400);
  assert.equal((await send(frame)).status, 200);

  const view = await teacher.get("/api/teacher/camera");
  assert.equal(view.status, 200, JSON.stringify(view.data));
  assert.equal(view.data.frame.deviceId, "gate-1");
  assert.equal(view.data.frame.seq, 7);
  assert.equal(view.data.frame.live, true);
  assert.equal(view.data.frame.stats.read, 1);
  assert.equal(view.data.frame.stats.lastError, "ECC failure");
  assert.equal(view.data.frame.image, `data:image/jpeg;base64,${jpeg}`);

  // A newer picture replaces the old one.
  assert.equal((await send({ ...frame, seq: 8 })).status, 200);
  assert.equal((await teacher.get("/api/teacher/camera?device=gate-1")).data.frame.seq, 8);

  // Students and parents can't see the camera.
  assert.equal((await student.get("/api/teacher/camera")).status, 403);
});

test("cross-site requests and logged-out access are blocked", async () => {
  const cross = await student.post("/api/student/sos", {}, { origin: "https://evil.example" });
  assert.equal(cross.status, 403);
  await student.post("/api/auth/logout");
  const after = await student.get("/api/student/dashboard");
  assert.equal(after.status, 401);
  const login = await student.post("/api/auth/login", { email: "JUAN@school.test", password: "password123" });
  assert.equal(login.status, 200);
  const wrong = await student.post("/api/auth/login", { email: "juan@school.test", password: "wrong-password" });
  assert.equal(wrong.status, 401);
});

test("ETA adapts to the observed speed", () => {
  const home = { lat: 14.5869, lng: 121.1753 };
  const now = new Date();
  const first = estimateEta({ trip: null, home, lat: 14.6288, lng: 121.2254, now, avgSpeedKmh: 20 });
  const trip = { startedAt: new Date(now.getTime() - 20 * 60000), initialRemainingKm: first.remainingKm };
  const slow = estimateEta({ trip, home, lat: 14.625, lng: 121.22, now, avgSpeedKmh: 20 });
  assert.ok(slow.speedKmh < 20, `walking pace lowers the speed (${slow.speedKmh})`);
  assert.ok(slow.etaMinutes > 0);
});
