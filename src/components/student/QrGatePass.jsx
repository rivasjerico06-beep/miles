import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Expand, GraduationCap, QrCode, RefreshCw, Sun, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatManilaDate, formatManilaTime, statusTone } from "@/lib/campus";

// "CP1:" + 20 characters with error correction Q fits a version-2 QR code (25 x 25 modules),
// drawn with whole-pixel modules and a 4-module white border. Level Q can repair about a quarter
// of the code, so glare and slight blur on a phone screen still read on the ESP32-CAM.
async function renderQr(text, scale) {
  const module = await import("qrcode");
  const QRCode = module.default ?? module;
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "Q",
    margin: 4,
    scale,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

// Each code works for a few minutes; the server says how long the current one has left. The code
// is hidden one second early so the scanner never reads it as it runs out, and the next code is
// requested just after the old one has expired on the server.
const HIDE_EARLY_MS = 1000;
const REFRESH_LATE_MS = 300;
const MIN_REFRESH_GAP_MS = 1000;

function countdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function useNow(enabled) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

function CodeTimer({ leftMs, totalMs, renewing }) {
  const low = !renewing && leftMs <= 15000;
  const fraction = renewing ? 0 : Math.min(1, Math.max(0, leftMs / totalMs));
  return (
    <div className="mx-auto mt-2 w-[256px] max-w-full">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          {renewing ? "Getting a new code…" : "Code expires in"}
        </span>
        {!renewing && <span className={`tabular-nums ${low ? "text-amber-600" : "text-foreground"}`}>{countdown(leftMs)}</span>}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-linear ${low ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}

function EntryRow({ label, usedAt, waiting }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-medium text-foreground">
        {usedAt ? (
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
        {label}
      </span>
      <span className="text-xs font-semibold text-muted-foreground">
        {usedAt ? `Recorded ${formatManilaTime(usedAt)}` : waiting ? "After check-in" : "Ready to scan"}
      </span>
    </li>
  );
}

export default function QrGatePass({ data, dataUpdatedAt, onRefresh }) {
  const { student, pass, today, settings } = data;
  const [images, setImages] = useState({ text: "", small: null, big: null });
  const [fullscreen, setFullscreen] = useState(false);
  const refreshRef = useRef(onRefresh);

  const usedUp = Boolean(pass.checkedInAt && pass.checkedOutAt);
  // When the current code stops working, on this phone's clock (from when the server answered).
  const expiresAt = typeof pass.expiresInMs === "number" && dataUpdatedAt ? dataUpdatedAt + pass.expiresInMs : null;
  const timed = !usedUp && expiresAt !== null;
  const now = useNow(timed);
  const leftMs = timed ? expiresAt - HIDE_EARLY_MS - now : 0;
  const renewing = timed && leftMs <= 0;
  const totalMs = (pass.validMinutes || 3) * 60 * 1000 - HIDE_EARLY_MS;

  useEffect(() => {
    refreshRef.current = onRefresh;
  });

  useEffect(() => {
    let active = true;
    const text = pass.qrText;
    Promise.all([renderQr(text, 8), renderQr(text, 14)])
      .then(([small, big]) => active && setImages({ text, small, big }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pass.qrText]);

  // Ask the server for the next code right after this one runs out.
  useEffect(() => {
    if (!timed) return undefined;
    const wait = Math.max(expiresAt + REFRESH_LATE_MS - Date.now(), MIN_REFRESH_GAP_MS);
    const timer = setTimeout(() => refreshRef.current?.(), wait);
    return () => clearTimeout(timer);
  }, [timed, expiresAt]);

  useEffect(() => {
    if (usedUp) setFullscreen(false);
  }, [usedUp]);

  const shown = images.text === pass.qrText && !renewing;
  const qr = shown ? images.small : null;
  const bigQr = shown ? images.big : null;
  const status = today?.status || "Not checked in yet";
  const minutes = pass.validMinutes || 3;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_10px_30px_-24px_rgba(219,39,119,0.6)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold">Today's gate pass</h2>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(today?.status)}`}>{status}</span>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div>
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            disabled={!bigQr || usedUp}
            className="group relative mx-auto block w-fit rounded-2xl bg-white p-3 shadow-sm"
            aria-label="Show the QR code full screen"
          >
            {qr ? (
              <img src={qr} alt={`Gate pass QR code for ${student.fullName}`} className={`block h-[232px] w-[232px] select-none [image-rendering:pixelated] ${usedUp ? "opacity-20" : ""}`} />
            ) : renewing ? (
              <div className="flex h-[232px] w-[232px] flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-500">
                <RefreshCw className="h-6 w-6 animate-spin" aria-hidden="true" />
                <span className="text-xs font-semibold">Getting a new code…</span>
              </div>
            ) : (
              <div className="h-[232px] w-[232px] animate-pulse rounded-xl bg-secondary" />
            )}
            {usedUp && (
              <span className="absolute inset-0 flex items-center justify-center text-center font-display text-sm font-bold text-foreground">
                Used for today
              </span>
            )}
          </button>
          {timed && <CodeTimer leftMs={leftMs} totalMs={totalMs} renewing={renewing} />}
        </div>

        <div className="space-y-3">
          <div>
            <p className="font-display text-lg font-bold leading-tight text-foreground">{student.fullName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-secondary-foreground">{student.studentNumber}</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                {student.gradeSection}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Pass for {formatManilaDate(pass.schoolDate)} · late after {settings.lateAfterLabel}
            </p>
          </div>

          <ul className="space-y-1.5">
            <EntryRow label="Check-in" usedAt={pass.checkedInAt} />
            <EntryRow label="Check-out" usedAt={pass.checkedOutAt} waiting={!pass.checkedInAt} />
          </ul>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Sun className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            {usedUp
              ? "This pass was used for both entries today. It works again tomorrow."
              : `Turn your screen brightness up and hold the phone 15–20 cm in front of the scanner camera. Scan once to check in, and once more at dismissal to check out. Each code works for only ${minutes} minutes and a new one appears by itself, so scan it from this app, not from a screenshot.`}
          </p>
          {!usedUp && (
            <Button type="button" variant="outline" size="sm" onClick={() => setFullscreen(true)} disabled={!bigQr}>
              <Expand className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Show bigger for scanning
            </Button>
          )}
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white p-6" role="dialog" aria-modal="true" aria-label="Gate pass">
          {bigQr ? (
            <img src={bigQr} alt={`Gate pass QR code for ${student.fullName}`} className="w-full max-w-[420px] [image-rendering:pixelated]" />
          ) : (
            <div className="flex aspect-square w-full max-w-[420px] flex-col items-center justify-center gap-3 rounded-2xl bg-slate-100 text-slate-500">
              <RefreshCw className="h-8 w-8 animate-spin" aria-hidden="true" />
              <span className="text-sm font-semibold">Getting a new code…</span>
            </div>
          )}
          <div className="text-center text-slate-900">
            <p className="font-display text-xl font-bold">{student.fullName}</p>
            <p className="font-mono text-sm">{student.studentNumber}</p>
            {timed && (
              <p className="mt-2 text-sm font-semibold tabular-nums text-slate-700">
                {renewing ? "One moment…" : `Code expires in ${countdown(leftMs)}`}
              </p>
            )}
            <p className="mt-1 text-sm text-slate-600">Hold steady in front of the scanner until it beeps.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setFullscreen(false)}>
            <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
