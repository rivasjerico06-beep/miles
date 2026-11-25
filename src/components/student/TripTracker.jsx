import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Footprints, Home, Loader2, MapPin, Navigation, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import MapView from "@/components/app/MapView";
import { api } from "@/lib/api";
import { HOME_GEOFENCE_M, SCHOOL, formatManilaTime, hasHomePin, metersBetween, schoolRouteUrl } from "@/lib/campus";

const SEND_EVERY_MS = 15000;
const SEND_AFTER_METERS = 30;

function readPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This phone can't share its location."));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }),
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "Location permission is blocked. Allow location for this site in your browser settings."
              : "Couldn't get a GPS fix. Go outside or near a window and try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

/**
 * After check-out the phone's GPS is followed until the student is within the home geofence.
 * Tracking starts by itself when location permission was already given, otherwise with one tap.
 */
export default function TripTracker({ data, onRefresh }) {
  const { student, today, trip } = data;
  const pinned = hasHomePin(student);
  const checkedOut = Boolean(today?.checkOutAt);
  const active = trip?.status === "active";

  const [live, setLive] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gpsProblem, setGpsProblem] = useState("");
  const autoStartTried = useRef(false);
  const refresh = useRef(onRefresh);
  useEffect(() => {
    refresh.current = onRefresh;
  }, [onRefresh]);

  const start = useCallback(async () => {
    setBusy(true);
    setGpsProblem("");
    try {
      const fix = await readPosition();
      setLive(fix);
      const result = await api.startTrip(fix);
      setMetrics(result);
      if (result.arrived) toast.success("You're already home. Your parent was notified.");
      else toast.success("Trip home started. Your parent can now see your location and ETA.");
      refresh.current?.();
    } catch (error) {
      setGpsProblem(error.message);
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }, []);

  // Right after check-out: start on its own if the location permission is already granted.
  useEffect(() => {
    if (!pinned || !checkedOut || trip || autoStartTried.current) return;
    autoStartTried.current = true;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((permission) => {
        if (permission.state === "granted") start();
      })
      .catch(() => {});
  }, [pinned, checkedOut, trip, start]);

  // During the trip: follow the GPS and send a fix every 15 s or 30 m.
  useEffect(() => {
    if (!active || !navigator.geolocation) return undefined;
    let cancelled = false;
    let sending = false;
    let last = { at: 0, lat: null, lng: null };
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (cancelled) return;
        const fix = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
        setLive(fix);
        setGpsProblem("");
        const moved = last.lat === null ? Infinity : metersBetween(last.lat, last.lng, fix.lat, fix.lng);
        if (sending || (Date.now() - last.at < SEND_EVERY_MS && moved < SEND_AFTER_METERS)) return;
        sending = true;
        last = { at: Date.now(), lat: fix.lat, lng: fix.lng };
        try {
          const result = await api.sendPosition(fix);
          setMetrics(result);
          if (result.arrived) {
            toast.success("You arrived home. Your parent was notified and sharing has stopped.");
            refresh.current?.();
          }
        } catch (error) {
          if (error.status === 409) refresh.current?.();
        } finally {
          sending = false;
        }
      },
      (error) => setGpsProblem(error.code === 1 ? "Location permission is blocked for this site." : "Waiting for a GPS fix…"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [active]);

  // A web page can only read GPS while it is open, so keep the screen on during the trip.
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return undefined;
    let lock = null;
    let stopped = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* the user can still keep the screen on manually */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);

  async function stop() {
    setBusy(true);
    try {
      await api.stopTrip();
      toast("Location sharing stopped. Your parent was told.");
      refresh.current?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  const remainingKm = metrics?.remainingKm ?? trip?.remainingKm;
  const etaMinutes = metrics?.etaMinutes ?? trip?.etaMinutes;
  const etaAt = metrics?.etaAt ?? trip?.etaAt;
  const position = live || (trip?.lastLat != null ? { lat: trip.lastLat, lng: trip.lastLng } : null);
  const distanceHome = position && pinned ? metersBetween(position.lat, position.lng, student.homeLat, student.homeLng) : null;
  const markers = [
    { id: "school", lat: SCHOOL.lat, lng: SCHOOL.lng, kind: "school" },
    ...(pinned ? [{ id: "home", lat: student.homeLat, lng: student.homeLng, kind: "home" }] : []),
    ...(position ? [{ id: "live", lat: position.lat, lng: position.lng, kind: "live" }] : []),
  ];

  let badge = { text: "Waiting", tone: "bg-muted text-muted-foreground" };
  if (active) badge = { text: "Sharing live", tone: "bg-primary/10 text-primary" };
  else if (trip?.status === "arrived") badge = { text: "Arrived", tone: "bg-violet-100 text-violet-700" };
  else if (trip?.status === "stopped") badge = { text: "Stopped", tone: "bg-amber-100 text-amber-700" };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_10px_30px_-26px_rgba(219,39,119,0.6)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Navigation className="h-4 w-4 text-primary" aria-hidden="true" />
            Trip home
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            After check-out, your phone's GPS shows your parent where you are and when you'll be home.
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.tone}`}>{badge.text}</span>
      </div>

      {!pinned ? (
        <p className="rounded-xl bg-secondary px-3 py-3 text-sm text-secondary-foreground">
          Pin your home location first (Home pin section). The app needs it for the ETA and to confirm you arrived.
        </p>
      ) : !checkedOut ? (
        <p className="rounded-xl bg-secondary px-3 py-3 text-sm text-secondary-foreground">
          Tracking starts after you scan your gate pass at dismissal. Keep this app open after check-out.
        </p>
      ) : (
        <>
          {trip?.status === "arrived" ? (
            <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
              <Home className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                You arrived home at <span className="font-semibold">{formatManilaTime(trip.arrivedAt)}</span>. Location sharing has
                stopped.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Remaining" value={remainingKm != null ? `${remainingKm} km` : "—"} />
              <Stat label="ETA" value={etaAt ? formatManilaTime(etaAt) : "—"} />
              <Stat label="Minutes" value={etaMinutes != null ? etaMinutes : "—"} />
            </div>
          )}

          <div className="mt-3">
            <MapView
              center={position ? [position.lat, position.lng] : [student.homeLat, student.homeLng]}
              zoom={14}
              markers={markers}
              circle={{ lat: student.homeLat, lng: student.homeLng, radius: HOME_GEOFENCE_M, color: "#7C3AED" }}
              heightClass="h-52 sm:h-60"
            />
          </div>

          {active && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              Keep this page open until you get home. It ends by itself within {HOME_GEOFENCE_M} m of your house
              {distanceHome !== null ? ` (now ${Math.round(distanceHome)} m away)` : ""}.
            </p>
          )}
          {gpsProblem && <p className="mt-2 text-xs text-destructive">{gpsProblem}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {active ? (
              <Button type="button" variant="outline" size="sm" onClick={stop} disabled={busy}>
                <Square className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Stop sharing
              </Button>
            ) : trip?.status !== "arrived" ? (
              <Button type="button" size="sm" onClick={start} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : trip?.status === "stopped" ? (
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                ) : (
                  <Footprints className="mr-1.5 h-4 w-4" aria-hidden="true" />
                )}
                {trip?.status === "stopped" ? "Share my trip again" : "Start sharing my trip home"}
              </Button>
            ) : null}
            <Button asChild type="button" variant="ghost" size="sm">
              <a href={schoolRouteUrl(student.homeLat, student.homeLng)} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Route in Google Maps
              </a>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
