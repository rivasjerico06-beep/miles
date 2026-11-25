import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import MapView from "@/components/app/MapView";
import { HOME_GEOFENCE_M, SCHOOL, formatManilaTime, hasHomePin, mapsPinUrl } from "@/lib/campus";

export default function ChildMapCard({ data }) {
  const { child, trip, directionsUrl } = data;
  const pinned = hasHomePin(child);
  const live = trip && trip.lastLat != null ? { lat: trip.lastLat, lng: trip.lastLng } : null;
  const active = trip?.status === "active";

  const markers = [
    { id: "school", lat: SCHOOL.lat, lng: SCHOOL.lng, kind: "school" },
    ...(pinned ? [{ id: "home", lat: child.homeLat, lng: child.homeLng, kind: "home" }] : []),
    ...(live ? [{ id: "live", lat: live.lat, lng: live.lng, kind: "live" }] : []),
  ];
  const center = live ? [live.lat, live.lng] : pinned ? [child.homeLat, child.homeLng] : [SCHOOL.lat, SCHOOL.lng];

  let badge = { text: "Not travelling", tone: "bg-muted text-muted-foreground" };
  if (active) badge = { text: "On the way home", tone: "bg-primary/10 text-primary" };
  else if (trip?.status === "arrived") badge = { text: "Arrived home", tone: "bg-violet-100 text-violet-700" };
  else if (trip?.status === "stopped") badge = { text: "Sharing stopped", tone: "bg-amber-100 text-amber-700" };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            Live location &amp; ETA home
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Shown from check-out until your child reaches home ({HOME_GEOFENCE_M} m ring around the home pin).
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.tone}`}>{badge.text}</span>
      </div>

      {!pinned && (
        <p className="mb-3 rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          Your child hasn't pinned the home location yet. They can do it in their app (Home pin).
        </p>
      )}

      <MapView
        center={center}
        zoom={14}
        markers={markers}
        path={trip?.path}
        circle={pinned ? { lat: child.homeLat, lng: child.homeLng, radius: HOME_GEOFENCE_M, color: "#7C3AED" } : null}
        heightClass="h-60 sm:h-72"
      />

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border bg-secondary/60 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Remaining</p>
          <p className="font-display text-lg font-bold">{active && trip.remainingKm != null ? `${trip.remainingKm} km` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/60 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">ETA home</p>
          <p className="font-display text-lg font-bold">
            {active && trip.etaAt ? formatManilaTime(trip.etaAt) : trip?.status === "arrived" ? formatManilaTime(trip.arrivedAt) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/60 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Last update</p>
          <p className="font-display text-lg font-bold">{trip?.lastFixAt ? formatManilaTime(trip.lastFixAt) : "—"}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {live ? (
          <Button asChild size="sm" variant="outline">
            <a href={mapsPinUrl(live.lat, live.lng)} target="_blank" rel="noreferrer">
              <Navigation className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Open location in Google Maps
            </a>
          </Button>
        ) : (
          <span className="inline-flex h-9 items-center rounded-lg bg-secondary px-3 text-xs font-medium text-muted-foreground">
            <Navigation className="mr-1.5 h-4 w-4" aria-hidden="true" />
            The live pin appears after check-out
          </span>
        )}
        {directionsUrl && (
          <Button asChild size="sm" variant="ghost">
            <a href={directionsUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />
              School-to-home route
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
