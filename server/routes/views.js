// Shapes database rows into the JSON the pages use.
import { statusLabel } from "../../src/lib/campus.js";

export function dayView(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.schoolDate,
    statusCode: row.status,
    status: statusLabel(row.status),
    late: row.late,
    checkInAt: row.checkInAt,
    checkInVia: row.checkInVia,
    checkOutAt: row.checkOutAt,
    checkOutVia: row.checkOutVia,
    arrivedHomeAt: row.arrivedHomeAt,
  };
}

export function tripView(trip, path) {
  if (!trip) return null;
  return {
    id: trip.id,
    status: trip.status,
    startedAt: trip.startedAt,
    remainingKm: trip.remainingKm,
    etaMinutes: trip.etaMinutes,
    etaAt: trip.etaAt,
    speedKmh: trip.speedKmh,
    lastLat: trip.lastLat,
    lastLng: trip.lastLng,
    lastAccuracyM: trip.lastAccuracyM,
    lastFixAt: trip.lastFixAt,
    initialEtaMinutes: trip.initialEtaMinutes,
    predictedArrivalAt: trip.predictedArrivalAt,
    arrivedAt: trip.arrivedAt,
    endedAt: trip.endedAt,
    ...(path ? { path } : {}),
  };
}

export function alertView(alert) {
  return {
    id: alert.id,
    createdAt: alert.createdAt,
    status: alert.status,
    locationSource: alert.locationSource,
    lat: alert.lat,
    lng: alert.lng,
    resolvedAt: alert.resolvedAt,
  };
}

export function noticeView(notice) {
  return {
    id: notice.id,
    type: notice.type,
    title: notice.title,
    body: notice.body,
    mapsUrl: notice.mapsUrl,
    eventAt: notice.eventAt,
    createdAt: notice.createdAt,
    read: Boolean(notice.readAt),
  };
}
