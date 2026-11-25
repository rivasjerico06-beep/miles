import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Cpu, Download, FlaskConical, Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, researchExportUrl } from "@/lib/api";
import { formatManilaDateTime } from "@/lib/campus";

const EXPORTS = [
  { type: "trials", label: "Trials (one row per student-day)" },
  { type: "scans", label: "Scan log" },
  { type: "notifications", label: "Notifications" },
  { type: "trips", label: "Trips & ETA" },
  { type: "device-events", label: "Scanner events" },
];

const show = (value, suffix = "") => (value === null || value === undefined ? "—" : `${value}${suffix}`);

function Metric({ label, value, note }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-xl font-bold tabular-nums text-foreground">{value}</p>
      {note && <p className="text-[11px] leading-snug text-muted-foreground">{note}</p>}
    </div>
  );
}

function Stats({ stats, unit }) {
  if (!stats?.n) return "no data yet";
  return `n=${stats.n} · mean ${stats.mean}${unit} · SD ${stats.sd}${unit} · min ${stats.min}${unit} · max ${stats.max}${unit}`;
}

const FAILURE_LABEL = { crash: "Scanner restarted (crash)", wifi_drop: "Wi-Fi dropped", http_error: "Request failed", scan_error: "Server error on scan" };

// Numbers for the statistical treatment (Success Rate, Mean Response Time, MAE, MTBF) and CSV exports.
export default function ResearchCard() {
  const [range, setRange] = useState({ from: "", to: "" });
  const [applied, setApplied] = useState({ from: "", to: "" });
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["research", applied],
    queryFn: () => api.research(applied),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <FlaskConical className="h-4 w-4 text-primary" aria-hidden="true" />
            Trials &amp; reliability data
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Logged automatically for every scan, notification and trip.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(range);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="range-from" className="text-xs">From</Label>
          <Input id="range-from" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="range-to" className="text-xs">To</Label>
          <Input id="range-to" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="h-9 w-40" />
        </div>
        <Button type="submit" size="sm" className="h-9">Apply</Button>
        {data && <p className="pb-2 text-[11px] text-muted-foreground">Showing {data.range.from} to {data.range.to}</p>}
      </form>

      {isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading trial data…
        </div>
      ) : error ? (
        <p className="mt-3 text-sm text-destructive">{error.message}</p>
      ) : (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scan accuracy &amp; response</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Scans received" value={data.scans.total} note={`${data.scans.accepted} accepted · ${data.scans.rejected} rejected · ${data.scans.duplicate} repeats`} />
            <Metric label="Processed without error" value={show(data.scans.processedWithoutErrorPct, "%")} note={`${data.scans.error} server errors`} />
            <Metric label="Scanner round trip (mean)" value={show(data.scans.deviceRoundTripMs.mean, " ms")} note={`SD ${show(data.scans.deviceRoundTripMs.sd, " ms")}`} />
            <Metric label="Server time (mean)" value={show(data.scans.serverMs.mean, " ms")} note={`n=${data.scans.serverMs.n}`} />
          </div>
          {Object.keys(data.scans.byReason).length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Rejected by reason:{" "}
              {Object.entries(data.scans.byReason)
                .map(([reason, count]) => `${reason.replace(/_/g, " ")} ${count}`)
                .join(" · ")}
            </p>
          )}

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications, cycles &amp; ETA</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Notification response (mean)" value={show(data.notifications.responseSeconds.mean, " s")} note={`SD ${show(data.notifications.responseSeconds.sd, " s")} · ${data.notifications.delivered}/${data.notifications.total} delivered`} />
            <Metric label="Complete cycles" value={show(data.cycles.successPct, "%")} note={`${data.cycles.completed} of ${data.cycles.total} scan → status → parent`} />
            <Metric label="ETA error (MAE)" value={show(data.eta.maeMinutes, " min")} note={`${data.eta.arrived} arrived trips · RMSE ${show(data.eta.rmseMinutes, " min")}`} />
            <Metric label="MTBF" value={show(data.reliability.mtbfHours, " h")} note={`${data.reliability.failures} failures in ${data.reliability.operatingHours} h of scanner uptime`} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Response time = event (scan / GPS) to first arrival on the parent's phone. Delivered by push {data.notifications.byChannel.push || 0},
            in-app {data.notifications.byChannel.in_app || 0}. Scanner round trip: <Stats stats={data.scans.deviceRoundTripMs} unit=" ms" />.
          </p>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scanners</h3>
          {data.devices.length === 0 ? (
            <p className="mt-2 rounded-xl bg-secondary px-3 py-3 text-xs text-secondary-foreground">
              No scanner has connected yet. Power on the ESP32-CAM; it reports here within a minute.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.devices.map((device) => (
                <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-2.5 text-xs">
                  <span className="flex items-center gap-2 font-semibold">
                    <Cpu className="h-4 w-4 text-primary" aria-hidden="true" />
                    {device.id}
                    <span className="font-normal text-muted-foreground">fw {device.firmware || "?"}</span>
                  </span>
                  <span className={`flex items-center gap-1 font-semibold ${device.online ? "text-success" : "text-muted-foreground"}`}>
                    {device.online ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
                    {device.online ? "Online" : "Offline"} · last seen {formatManilaDateTime(device.lastSeenAt)}
                  </span>
                  <span className="w-full text-muted-foreground">
                    Signal {show(device.rssi, " dBm")} · scans {show(device.scans)} · unreadable codes {show(device.decodeFails)} · Wi-Fi drops{" "}
                    {show(device.wifiReconnects)} · last restart {formatManilaDateTime(device.lastBootAt)} ({device.lastResetReason || "?"})
                  </span>
                </li>
              ))}
            </ul>
          )}

          {data.reliability.failureLog.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent failures</h3>
              <ul className="mt-2 space-y-1 text-xs">
                {data.reliability.failureLog.slice(0, 8).map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="flex items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                    {formatManilaDateTime(entry.at)} · {FAILURE_LABEL[entry.type] || entry.type} ({entry.source}){entry.count > 1 ? ` ×${entry.count}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Download for analysis (CSV)</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXPORTS.map(({ type, label }) => (
          <Button key={type} asChild variant="outline" size="sm">
            <a href={researchExportUrl(type, applied)} download>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {label}
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}
