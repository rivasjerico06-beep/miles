import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Expand, GraduationCap, QrCode, Sun, X } from "lucide-react";
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

export default function QrGatePass({ data }) {
  const { student, pass, today, settings } = data;
  const [qr, setQr] = useState(null);
  const [bigQr, setBigQr] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    renderQr(pass.qrText, 8).then((url) => active && setQr(url)).catch(() => {});
    renderQr(pass.qrText, 14).then((url) => active && setBigQr(url)).catch(() => {});
    return () => {
      active = false;
    };
  }, [pass.qrText]);

  const usedUp = Boolean(pass.checkedInAt && pass.checkedOutAt);
  const status = today?.status || "Not checked in yet";

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
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          disabled={!bigQr || usedUp}
          className="group relative mx-auto block w-fit rounded-2xl bg-white p-3 shadow-sm"
          aria-label="Show the QR code full screen"
        >
          {qr ? (
            <img src={qr} alt={`Gate pass QR code for ${student.fullName}`} className={`block h-[232px] w-[232px] select-none [image-rendering:pixelated] ${usedUp ? "opacity-20" : ""}`} />
          ) : (
            <div className="h-[232px] w-[232px] animate-pulse rounded-xl bg-secondary" />
          )}
          {usedUp && (
            <span className="absolute inset-0 flex items-center justify-center text-center font-display text-sm font-bold text-foreground">
              Used for today
            </span>
          )}
        </button>

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
              Valid only on {formatManilaDate(pass.schoolDate)} · late after {settings.lateAfterLabel}
            </p>
          </div>

          <ul className="space-y-1.5">
            <EntryRow label="Check-in" usedAt={pass.checkedInAt} />
            <EntryRow label="Check-out" usedAt={pass.checkedOutAt} waiting={!pass.checkedInAt} />
          </ul>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Sun className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            {usedUp
              ? "This pass was used for both entries today. A new one-time code appears tomorrow."
              : "Turn your screen brightness up and hold the phone 10–20 cm in front of the scanner camera. Scan once to check in, and once more at dismissal to check out."}
          </p>
          {!usedUp && (
            <Button type="button" variant="outline" size="sm" onClick={() => setFullscreen(true)} disabled={!bigQr}>
              <Expand className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Show bigger for scanning
            </Button>
          )}
        </div>
      </div>

      {fullscreen && bigQr && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white p-6" role="dialog" aria-modal="true" aria-label="Gate pass">
          <img src={bigQr} alt={`Gate pass QR code for ${student.fullName}`} className="w-full max-w-[420px] [image-rendering:pixelated]" />
          <div className="text-center text-slate-900">
            <p className="font-display text-xl font-bold">{student.fullName}</p>
            <p className="font-mono text-sm">{student.studentNumber}</p>
            <p className="mt-2 text-sm text-slate-600">Hold steady in front of the scanner until it beeps.</p>
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
