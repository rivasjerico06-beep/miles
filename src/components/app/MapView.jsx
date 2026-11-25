import { useEffect, useState } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const pin = (color) =>
  L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 3px 8px rgba(30,41,59,.35)"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });

const livePin = L.divIcon({
  className: "",
  html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 7px rgba(37,99,235,.22)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const ICONS = {
  school: pin("#EC4899"),
  home: pin("#7C3AED"),
  pin: pin("#DB2777"),
  live: livePin,
};

function ClickCatcher({ onPick }) {
  useMapEvents({
    click(event) {
      onPick?.(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function Recenter({ center, zoom }) {
  const map = useMap();
  const lat = center?.[0];
  const lng = center?.[1];
  useEffect(() => {
    if (typeof lat === "number" && typeof lng === "number") map.setView([lat, lng], zoom ?? map.getZoom());
  }, [lat, lng, zoom, map]);
  return null;
}

/**
 * markers: [{ id, lat, lng, kind, label, draggable, onDragEnd }]
 * circle: { lat, lng, radius, color }
 * path: [[lat, lng], ...] drawn as a line (the trip so far)
 */
export default function MapView({
  center,
  zoom = 13,
  markers = [],
  circle = null,
  path = null,
  onPick,
  heightClass = "h-64",
  className = "",
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) {
    return <div className={`${heightClass} w-full animate-pulse rounded-2xl bg-secondary ${className}`} />;
  }

  return (
    <div className={`${heightClass} w-full overflow-hidden rounded-2xl border border-border ${className}`}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className="h-full w-full" attributionControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {onPick && <ClickCatcher onPick={onPick} />}
        <Recenter center={center} zoom={zoom} />
        {circle && (
          <Circle
            center={[circle.lat, circle.lng]}
            radius={circle.radius}
            pathOptions={{ color: circle.color || "#7C3AED", fillColor: circle.color || "#7C3AED", fillOpacity: 0.12 }}
          />
        )}
        {path && path.length > 1 && <Polyline positions={path} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.7 }} />}
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={ICONS[marker.kind] || ICONS.pin}
            draggable={!!marker.draggable}
            eventHandlers={
              marker.onDragEnd
                ? {
                    dragend: (event) => {
                      const { lat, lng } = event.target.getLatLng();
                      marker.onDragEnd(lat, lng);
                    },
                  }
                : undefined
            }
          />
        ))}
      </MapContainer>
    </div>
  );
}