// Shared constants and pure helpers, used by both the browser and the API server.

export const APP_NAME = "CampusPulse";

export const SCHOOL = {
  name: "Antipolo City National Science and Technology High School",
  shortName: "ACNSTHS",
  address: "Sitio Cabading, Brgy. San Jose, Antipolo City, Rizal",
  lat: 14.62881,
  lng: 121.22547,
};

export const TIME_ZONE = "Asia/Manila";

// Arrival is confirmed when the phone is within this distance of the pinned home.
export const HOME_GEOFENCE_M = 60;
// Fixes less accurate than this never confirm an arrival (they still update the map).
export const ARRIVAL_MAX_ACCURACY_M = 100;
// Road distance is longer than the straight line between two points.
export const ROUTE_FACTOR = 1.3;

// Defaults for the settings teachers can change on their dashboard.
export const DEFAULT_SETTINGS = {
  lateAfter: "07:01", // 7:01 AM is still on time, 7:02 AM is late
  minCheckoutMinutes: 2, // a second scan sooner than this is treated as a repeat, not a check-out
  avgSpeedKmh: 20, // starting speed for the ETA before the trip's own speed is known
};

// How often the dashboards refresh while they are open.
export const POLL_MS = { parent: 5000, student: 8000, teacher: 15000 };

export const GRADE_SECTIONS = [
  "12 - Leonhard Euler",
  "12 - Isaac Newton",
  "11 - Albert Einstein",
  "10 - Marie Curie",
];

export const ROLE_LABELS = { student: "Student", parent: "Parent", teacher: "Teacher" };
const ROLE_HOME = { student: "/student", parent: "/parent", teacher: "/teacher" };

export function roleHome(role) {
  return ROLE_HOME[role] || "/login";
}

export const STATUS_LABELS = {
  on_campus: "On Campus",
  late: "Late",
  checked_out: "Checked Out",
  arrived_home: "Arrived Home",
};

export function statusLabel(code) {
  return STATUS_LABELS[code] || "Not checked in";
}

// Asia/Manila wall clock, independent of the device or server time zone.
export function manilaClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(read("hour")) % 24;
  const minute = Number(read("minute"));
  return {
    dateKey: `${read("year")}-${read("month")}-${read("day")}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
    label: formatMinutes(hour * 60 + minute),
  };
}

// "07:01" -> 421
export function minutesFromHHMM(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// 421 -> "7:01 AM"
export function formatMinutes(total) {
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatManilaTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function formatManilaDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function formatManilaDate(dateKey) {
  if (!dateKey) return "—";
  const [y, m, d] = String(dateKey).split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 4)));
}

export function metersBetween(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function mapsPinUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function schoolRouteUrl(homeLat, homeLng) {
  return `https://www.google.com/maps/dir/?api=1&origin=${SCHOOL.lat},${SCHOOL.lng}&destination=${homeLat},${homeLng}`;
}

export function hasHomePin(student) {
  return typeof student?.homeLat === "number" && typeof student?.homeLng === "number";
}

export function normalizeStudentNumber(value) {
  const clean = String(value || "").trim().toUpperCase();
  return /^\d{4}-\d{4}$/.test(clean) ? clean : null;
}

export function normalizeSection(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length >= 3 && clean.length <= 80 ? clean : null;
}

export function sameSection(a, b) {
  const tidy = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  return tidy(a) === tidy(b);
}

export function statusTone(label) {
  switch (label) {
    case "On Campus":
      return "bg-success/10 text-success border-success/30";
    case "Late":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Checked Out":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "Arrived Home":
      return "bg-violet-50 text-violet-700 border-violet-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
