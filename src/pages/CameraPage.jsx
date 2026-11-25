import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Camera, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadError, LoadingScreen } from "@/components/app/StatusScreens";
import { api } from "@/lib/api";
import { formatManilaDateTime } from "@/lib/campus";

// Teacher-only page (not linked from the menus): the newest picture from the ESP32-CAM, for
// aiming and focusing the gate scanner. The scanner sends pictures for a few minutes after it starts.
const LIVE_POLL_MS = 1500;
const IDLE_POLL_MS = 5000;

const show = (value, suffix = "") => (value === null || value === undefined ? "—" : `${value}${suffix}`);

const TONES = {
  good: "border-emerald-300/70 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-200",
  warn: "border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
};

function Stat({ label, value, note, tone }) {
  const color = tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-secondary/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {note && <p className="text-[11px] leading-snug text-muted-foreground">{note}</p>}
    </div>
  );
}

function brightnessNote(value) {
  if (value === null || value === undefined) return "";
  if (value < 50) return "Too dark: add light or raise the phone's brightness";
  if (value > 210) return "Very bright: watch for glare on the phone screen";
  return "OK (0 = black, 255 = white)";
}

// Plain-language reading of the scanner's counters (they count from the scanner's last restart).
function diagnosis(stats) {
  if ((stats.read ?? 0) > 0) {
    return { tone: "good", text: "The camera is reading QR codes. Every code it reads is sent to the website as a scan." };
  }
  if ((stats.found ?? 0) > 0) {
    const why = stats.lastError ? ` (last error: ${stats.lastError})` : "";
    return {
      tone: "warn",
      text: `The camera finds QR codes but can't read them yet${why}. That is usually blur or glare: hold the phone still about 15–20 cm away, tilt it to remove reflections, or adjust the lens focus.`,
    };
  }
  if ((stats.frames ?? 0) === 0) {
    return { tone: "bad", text: "The QR reader isn't getting any frames from the camera. Restart the scanner." };
  }
  return {
    tone: "warn",
    text: "No QR code recognized yet. Hold the pass so the code fills about a third of the picture, keep it still for a second, and check that the picture is sharp.",
  };
}

function formatLeft(seconds) {
  if (!seconds) return "ended";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left`;
}

export default function CameraPage() {
  const { data, error, isPending, refetch, isFetching } = useQuery({
    queryKey: ["teacher-camera"],
    queryFn: () => api.cameraView(),
    refetchInterval: (query) => (query.state.data?.frame?.live ? LIVE_POLL_MS : IDLE_POLL_MS),
  });

  if (isPending) return <LoadingScreen label="Loading the scanner camera…" />;
  if (error) return <LoadError title="We couldn't load the scanner camera" error={error} onRetry={refetch} />;

  const frame = data.frame;
  const stats = frame?.stats || {};
  const device = data.devices.find((item) => item.id === frame?.deviceId) || data.devices[0];
  const hint = frame?.live ? diagnosis(stats) : null;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link to="/teacher" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Teacher dashboard
          </Link>
          <h1 className="mt-1 flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <Camera className="h-5 w-5 text-primary" aria-hidden="true" />
            Scanner camera
          </h1>
          <p className="text-sm text-muted-foreground">What the gate scanner's camera sees, for aiming and focusing it.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
          {frame ? (
            <div>
              <div className="relative overflow-hidden rounded-xl bg-black">
                <img
                  src={frame.image}
                  alt="Latest picture from the scanner camera"
                  width={frame.width}
                  height={frame.height}
                  className={`block h-auto w-full ${frame.live ? "" : "opacity-50"}`}
                />
                <span
                  className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${frame.live ? "bg-red-600" : "bg-black/70"}`}
                >
                  {frame.live ? "● LIVE" : "Not live"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {frame.deviceId} · picture #{frame.seq} · {frame.width}×{frame.height} ·{" "}
                {frame.live ? `${frame.ageS} s ago` : `last picture ${formatManilaDateTime(frame.receivedAt)}`}
              </p>
            </div>
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl bg-secondary/50 p-6 text-center">
              <Camera className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No pictures yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">The scanner needs firmware 2.0.4 or newer to send pictures.</p>
            </div>
          )}
          {!frame?.live && (
            <p className={`rounded-xl border p-3 text-sm ${TONES.warn}`}>
              The scanner sends pictures for 5 minutes after it starts. Press <strong>RST</strong> on the scanner and wait about 15
              seconds; this page updates by itself.
            </p>
          )}
        </div>

        <div className="space-y-3">
          {hint && <p className={`rounded-xl border p-3 text-sm ${TONES[hint.tone]}`}>{hint.text}</p>}

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Brightness" value={show(stats.brightness)} note={brightnessNote(stats.brightness)} />
            <Stat label="Sharpness" value={show(stats.sharpness)} note="Higher is sharper: watch it while focusing" />
            <Stat label="Frames checked" value={show(stats.frames)} note={stats.fps !== undefined ? `${stats.fps} per second` : ""} />
            <Stat label="QR codes found" value={show(stats.found)} />
            <Stat label="Read OK" value={show(stats.read)} tone={(stats.read ?? 0) > 0 ? "good" : undefined} />
            <Stat
              label="Couldn't read"
              value={show(stats.decodeFails)}
              note={stats.lastError ? `Last: ${stats.lastError}` : ""}
              tone={(stats.decodeFails ?? 0) > 0 ? "bad" : undefined}
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-3 text-sm">
            <p className="font-semibold">Scanner</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{show(device?.id)}</dd>
              <dt className="text-muted-foreground">Firmware</dt>
              <dd>{show(stats.fw || device?.firmware)}</dd>
              <dt className="text-muted-foreground">Last check-in</dt>
              <dd>{device?.lastSeenAt ? formatManilaDateTime(device.lastSeenAt) : "—"}</dd>
              <dt className="text-muted-foreground">Wi-Fi signal</dt>
              <dd>{show(stats.rssi ?? device?.rssi, " dBm")}</dd>
              <dt className="text-muted-foreground">Scans sent</dt>
              <dd>{show(stats.scans)}</dd>
              <dt className="text-muted-foreground">Preview</dt>
              <dd>{frame?.live ? formatLeft(stats.previewLeftS) : "off"}</dd>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-card p-3 text-sm">
            <p className="font-semibold">Tips for a good read</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Turn the phone's brightness up and open the pass with "Show bigger for scanning".</li>
              <li>Hold it still about 15–20 cm from the camera, facing it straight on.</li>
              <li>The code should fill about a third of the picture; tilt the phone a little if you see glare on it.</li>
              <li>If the code stays blurry, the camera lens can be turned slightly to focus closer.</li>
            </ul>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Only teacher accounts can open this page. The scanner sends pictures only during its 5-minute preview after a
            restart, and only the newest picture is kept.
          </p>
        </div>
      </div>
    </div>
  );
}
