// Trip home after check-out: phone GPS -> remaining distance -> dynamic ETA -> arrival.
import { and, desc, eq, lt } from "drizzle-orm";
import {
  ARRIVAL_MAX_ACCURACY_M,
  HOME_GEOFENCE_M,
  ROUTE_FACTOR,
  formatManilaTime,
  hasHomePin,
  manilaClock,
  mapsPinUrl,
  metersBetween,
} from "../../src/lib/campus.js";
import { locationPings, sosAlerts, trips } from "../db/schema.js";
import { fail } from "../http.js";
import { firstName, getAttendance, saveAttendance } from "./attendance.js";
import { notifyParent } from "./notify.js";
import { getSettings } from "./settings.js";

const MIN_PING_GAP_MS = 10000;
const PING_RETENTION_DAYS = 30;

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * ETA = remaining road distance / speed.
 * Road distance is the straight-line distance times ROUTE_FACTOR. The speed starts at the
 * configured average and shifts toward the trip's own observed speed as the trip goes on
 * (fully after 15 minutes), so the estimate adapts to walking, jeepney or tricycle rides.
 */
export function estimateEta({ trip, home, lat, lng, now, avgSpeedKmh }) {
  const straightM = metersBetween(lat, lng, home.lat, home.lng);
  const remainingKm = (straightM / 1000) * ROUTE_FACTOR;
  let speedKmh = avgSpeedKmh;
  if (trip) {
    const elapsedMin = (now - trip.startedAt) / 60000;
    const progressKm = trip.initialRemainingKm - remainingKm;
    if (elapsedMin >= 3 && progressKm >= 0.3) {
      const observed = progressKm / (elapsedMin / 60);
      const weight = Math.min(1, elapsedMin / 15);
      speedKmh = weight * observed + (1 - weight) * avgSpeedKmh;
    }
  }
  speedKmh = Math.min(60, Math.max(4, speedKmh));
  const etaMinutes = Math.max(1, Math.round((remainingKm / speedKmh) * 60));
  return {
    straightM,
    remainingKm: round1(remainingKm),
    speedKmh: round1(speedKmh),
    etaMinutes,
    etaAt: new Date(now.getTime() + etaMinutes * 60000),
  };
}

function isArrival(straightM, accuracy) {
  return straightM <= HOME_GEOFENCE_M && (accuracy == null || accuracy <= ARRIVAL_MAX_ACCURACY_M);
}

export async function latestTrip(db, studentId, dateKey) {
  const [trip] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.studentId, studentId), eq(trips.schoolDate, dateKey)))
    .orderBy(desc(trips.startedAt))
    .limit(1);
  return trip ?? null;
}

export async function tripPath(db, tripId, limit = 400) {
  const rows = await db
    .select({ lat: locationPings.lat, lng: locationPings.lng })
    .from(locationPings)
    .where(eq(locationPings.tripId, tripId))
    .orderBy(desc(locationPings.recordedAt))
    .limit(limit);
  return rows.reverse().map((row) => [row.lat, row.lng]);
}

export async function startTrip(db, student, { lat, lng, accuracy = null }) {
  if (!hasHomePin(student)) fail(400, "Pin your home location first, so the app can measure the trip.");
  const clock = manilaClock();
  const today = await getAttendance(db, student.id, clock.dateKey);
  if (!today?.checkOutAt) {
    fail(409, "Tracking starts after check-out. Scan your gate pass at dismissal first.");
  }
  if (today.status === "arrived_home") fail(409, "You already arrived home today.");

  const existing = await latestTrip(db, student.id, clock.dateKey);
  if (existing?.status === "active") return updatePosition(db, student, { lat, lng, accuracy });

  const settings = await getSettings(db);
  const now = new Date();
  const home = { lat: student.homeLat, lng: student.homeLng };
  const eta = estimateEta({ trip: null, home, lat, lng, now, avgSpeedKmh: settings.avgSpeedKmh });
  const [trip] = await db
    .insert(trips)
    .values({
      studentId: student.id,
      schoolDate: clock.dateKey,
      status: "active",
      startedAt: now,
      startLat: lat,
      startLng: lng,
      initialRemainingKm: eta.remainingKm,
      initialEtaMinutes: eta.etaMinutes,
      predictedArrivalAt: eta.etaAt,
      lastLat: lat,
      lastLng: lng,
      lastAccuracyM: accuracy,
      lastFixAt: now,
      remainingKm: eta.remainingKm,
      etaMinutes: eta.etaMinutes,
      etaAt: eta.etaAt,
      speedKmh: eta.speedKmh,
    })
    .returning();
  await db
    .insert(locationPings)
    .values({ tripId: trip.id, lat, lng, accuracyM: accuracy, remainingKm: eta.remainingKm, etaMinutes: eta.etaMinutes, recordedAt: now });
  await db
    .delete(locationPings)
    .where(lt(locationPings.recordedAt, new Date(now.getTime() - PING_RETENTION_DAYS * 24 * 60 * 60 * 1000)));

  if (isArrival(eta.straightM, accuracy)) {
    await arriveHome(db, student, trip, { lat, lng, now });
    return { tripId: trip.id, arrived: true, remainingKm: 0, etaMinutes: 0, meters: Math.round(eta.straightM) };
  }

  await notifyParent(db, student, {
    type: "eta",
    title: `${firstName(student.fullName)} is on the way home`,
    body: `ETA ${formatManilaTime(eta.etaAt)} · about ${eta.etaMinutes} min · ${eta.remainingKm} km to go.`,
    mapsUrl: mapsPinUrl(lat, lng),
    eventAt: now,
  });
  return {
    tripId: trip.id,
    arrived: false,
    remainingKm: eta.remainingKm,
    etaMinutes: eta.etaMinutes,
    etaAt: eta.etaAt,
    meters: Math.round(eta.straightM),
  };
}

export async function updatePosition(db, student, { lat, lng, accuracy = null }) {
  const clock = manilaClock();
  const trip = await latestTrip(db, student.id, clock.dateKey);
  if (!trip || trip.status !== "active") fail(409, "There is no active trip. Start your trip home first.");
  if (!hasHomePin(student)) fail(400, "Pin your home location first.");

  const settings = await getSettings(db);
  const now = new Date();
  const eta = estimateEta({
    trip,
    home: { lat: student.homeLat, lng: student.homeLng },
    lat,
    lng,
    now,
    avgSpeedKmh: settings.avgSpeedKmh,
  });
  await db
    .update(trips)
    .set({
      lastLat: lat,
      lastLng: lng,
      lastAccuracyM: accuracy,
      lastFixAt: now,
      remainingKm: eta.remainingKm,
      etaMinutes: eta.etaMinutes,
      etaAt: eta.etaAt,
      speedKmh: eta.speedKmh,
    })
    .where(eq(trips.id, trip.id));

  const arrived = isArrival(eta.straightM, accuracy);
  const [lastPing] = await db
    .select({ recordedAt: locationPings.recordedAt })
    .from(locationPings)
    .where(eq(locationPings.tripId, trip.id))
    .orderBy(desc(locationPings.recordedAt))
    .limit(1);
  if (arrived || !lastPing || now - lastPing.recordedAt >= MIN_PING_GAP_MS) {
    await db
      .insert(locationPings)
      .values({ tripId: trip.id, lat, lng, accuracyM: accuracy, remainingKm: eta.remainingKm, etaMinutes: eta.etaMinutes, recordedAt: now });
  }

  if (arrived) {
    await arriveHome(db, student, trip, { lat, lng, now });
    return { tripId: trip.id, arrived: true, remainingKm: 0, etaMinutes: 0, meters: Math.round(eta.straightM) };
  }
  return {
    tripId: trip.id,
    arrived: false,
    remainingKm: eta.remainingKm,
    etaMinutes: eta.etaMinutes,
    etaAt: eta.etaAt,
    meters: Math.round(eta.straightM),
  };
}

async function arriveHome(db, student, trip, { lat, lng, now }) {
  const etaErrorMinutes = Math.round(((now - trip.predictedArrivalAt) / 60000) * 10) / 10;
  await db
    .update(trips)
    .set({
      status: "arrived",
      arrivedAt: now,
      endedAt: now,
      lastLat: lat,
      lastLng: lng,
      lastFixAt: now,
      remainingKm: 0,
      etaMinutes: 0,
      etaAt: now,
      etaErrorMinutes,
    })
    .where(eq(trips.id, trip.id));
  await saveAttendance(db, student.id, trip.schoolDate, { status: "arrived_home", arrivedHomeAt: now });
  await notifyParent(db, student, {
    type: "arrived_home",
    title: `${firstName(student.fullName)} arrived home`,
    body: `Reached home at ${formatManilaTime(now)} (first estimate was ${formatManilaTime(trip.predictedArrivalAt)}).`,
    mapsUrl: mapsPinUrl(lat, lng),
    eventAt: now,
  });
}

export async function stopTrip(db, student) {
  const clock = manilaClock();
  const trip = await latestTrip(db, student.id, clock.dateKey);
  if (!trip || trip.status !== "active") return { stopped: false };
  const now = new Date();
  await db.update(trips).set({ status: "stopped", endedAt: now }).where(eq(trips.id, trip.id));
  await notifyParent(db, student, {
    type: "trip_stopped",
    title: `${firstName(student.fullName)} stopped sharing location`,
    body: `Location sharing ended at ${formatManilaTime(now)} before reaching home.`,
    mapsUrl: trip.lastLat != null ? mapsPinUrl(trip.lastLat, trip.lastLng) : null,
    eventAt: now,
  });
  return { stopped: true };
}

// SOS: sends the live location, or the last known one from the latest trip.
export async function triggerSos(db, student, { lat, lng, accuracy = null }) {
  const now = new Date();
  const [recent] = await db
    .select()
    .from(sosAlerts)
    .where(eq(sosAlerts.studentId, student.id))
    .orderBy(desc(sosAlerts.createdAt))
    .limit(1);
  if (recent && now - recent.createdAt < 30000) {
    return { alertId: recent.id, duplicate: true, parentLinked: Boolean(student.parentUserId), locationSource: recent.locationSource };
  }

  let position = typeof lat === "number" && typeof lng === "number" ? { lat, lng, accuracy, source: "live", at: now } : null;
  if (!position) {
    const [lastTrip] = await db
      .select()
      .from(trips)
      .where(eq(trips.studentId, student.id))
      .orderBy(desc(trips.startedAt))
      .limit(1);
    if (lastTrip?.lastLat != null) {
      position = { lat: lastTrip.lastLat, lng: lastTrip.lastLng, accuracy: lastTrip.lastAccuracyM, source: "last_known", at: lastTrip.lastFixAt };
    }
  }
  const [alert] = await db
    .insert(sosAlerts)
    .values({
      studentId: student.id,
      createdAt: now,
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      accuracyM: position?.accuracy ?? null,
      locationSource: position?.source ?? "none",
    })
    .returning();

  const where =
    position?.source === "live"
      ? "Their live location is attached."
      : position?.source === "last_known"
        ? `Their last known location (${formatManilaTime(position.at)}) is attached.`
        : "Their location was not available.";
  await notifyParent(db, student, {
    type: "sos",
    title: `SOS from ${student.fullName}`,
    body: `Emergency alert sent at ${formatManilaTime(now)}. ${where}`,
    mapsUrl: position ? mapsPinUrl(position.lat, position.lng) : null,
    eventAt: now,
  });
  return {
    alertId: alert.id,
    duplicate: false,
    parentLinked: Boolean(student.parentUserId),
    locationSource: alert.locationSource,
    mapsUrl: position ? mapsPinUrl(position.lat, position.lng) : null,
  };
}
