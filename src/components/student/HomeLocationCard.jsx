import { useState } from "react";
import { toast } from "sonner";
import { Crosshair, ExternalLink, Home, Loader2, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import MapView from "@/components/app/MapView";
import { SCHOOL, hasHomePin, schoolRouteUrl } from "@/lib/campus";
import { api } from "@/lib/api";

export default function HomeLocationCard({ student, onSaved }) {
  const pinned = hasHomePin(student);
  const [draft, setDraft] = useState({
    lat: pinned ? student.homeLat : SCHOOL.lat,
    lng: pinned ? student.homeLng : SCHOOL.lng,
  });
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  function useCurrentGps() {
    if (!navigator.geolocation) {
      toast.error("This device can't read GPS.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
        toast.success("Current GPS loaded — tap Save home location to keep it.");
      },
      () => {
        setLocating(false);
        toast.error("Location permission was blocked. Tap the map to pin your house instead.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function save() {
    setBusy(true);
    try {
      await api.saveHome({ lat: draft.lat, lng: draft.lng });
      toast.success("Home location saved.");
      onSaved?.();
    } catch (err) {
      toast.error(err?.message || "Could not save your home location.");
    } finally {
      setBusy(false);
    }
  }

  const markers = [
    { id: "school", lat: SCHOOL.lat, lng: SCHOOL.lng, kind: "school" },
    { id: "home", lat: draft.lat, lng: draft.lng, kind: "home", draggable: true, onDragEnd: (lat, lng) => setDraft({ lat, lng }) },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_10px_30px_-26px_rgba(219,39,119,0.6)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Home className="h-4 w-4 text-primary" aria-hidden="true" />
            My home location
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tap the map or drag the pin to mark your exact house. Used for the ETA and to confirm you arrived home.
          </p>
        </div>
        {pinned && (
          <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
            Pinned
          </span>
        )}
      </div>

      <MapView
        center={[draft.lat, draft.lng]}
        zoom={pinned ? 15 : 13}
        markers={markers}
        onPick={(lat, lng) => setDraft({ lat, lng })}
        heightClass="h-56 sm:h-64"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 font-mono text-[11px] text-secondary-foreground">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={useCurrentGps} disabled={locating}>
          {locating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Crosshair className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          Use my current GPS as home
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          Save home location
        </Button>
        {pinned && (
          <Button asChild type="button" variant="ghost" size="sm">
            <a href={schoolRouteUrl(student.homeLat, student.homeLng)} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Open in Google Maps
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}