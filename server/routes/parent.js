import { Router } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { manilaClock, schoolRouteUrl } from "../../src/lib/campus.js";
import { childForParent, requireRole } from "../auth.js";
import { getDb } from "../db/client.js";
import { attendance, notifications, sosAlerts } from "../db/schema.js";
import { fail } from "../http.js";
import { getAttendance } from "../services/attendance.js";
import { markDelivered } from "../services/notify.js";
import { latestTrip, tripPath } from "../services/trips.js";
import { alertView, dayView, noticeView, tripView } from "./views.js";

const router = Router();
router.use(requireRole("parent"));

router.get("/dashboard", async (req, res) => {
  const db = getDb();
  const child = await childForParent(req.user.id);
  const clock = manilaClock();
  if (!child) return res.json({ child: null, clock });

  const [today, trip, notices, history, alerts] = await Promise.all([
    getAttendance(db, child.id, clock.dateKey),
    latestTrip(db, child.id, clock.dateKey),
    db
      .select()
      .from(notifications)
      .where(eq(notifications.parentUserId, req.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(30),
    db.select().from(attendance).where(eq(attendance.studentId, child.id)).orderBy(desc(attendance.schoolDate)).limit(20),
    db.select().from(sosAlerts).where(eq(sosAlerts.studentId, child.id)).orderBy(desc(sosAlerts.createdAt)).limit(5),
  ]);

  // The parent's app just received these: this is the in-app delivery time used for the response-time data.
  const undelivered = notices.filter((notice) => !notice.deliveredAt).map((notice) => notice.id);
  await markDelivered(db, req.user.id, undelivered, "in_app");

  const path = trip ? await tripPath(db, trip.id) : [];
  res.json({
    child: {
      fullName: child.fullName,
      studentNumber: child.studentNumber,
      gradeSection: child.gradeSection,
      homeLat: child.homeLat,
      homeLng: child.homeLng,
    },
    today: dayView(today),
    trip: tripView(trip, path),
    notices: notices.map(noticeView),
    unread: notices.filter((notice) => !notice.readAt).length,
    history: history.map(dayView),
    alerts: alerts.map(alertView),
    directionsUrl: typeof child.homeLat === "number" ? schoolRouteUrl(child.homeLat, child.homeLng) : "",
    clock,
  });
});

router.post("/notifications/read", async (req, res) => {
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.parentUserId, req.user.id), isNull(notifications.readAt)));
  res.json({ ok: true });
});

router.post("/sos/:id/resolve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) fail(400, "Unknown alert.");
  const child = await childForParent(req.user.id);
  if (!child) fail(404, "No child is linked to this account.");
  const [updated] = await getDb()
    .update(sosAlerts)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(eq(sosAlerts.id, id), eq(sosAlerts.studentId, child.id)))
    .returning({ id: sosAlerts.id });
  if (!updated) fail(404, "That alert was not found.");
  res.json({ ok: true });
});

export default router;
