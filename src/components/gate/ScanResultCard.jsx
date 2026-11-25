import { CheckCircle2, Loader2, ScanLine, XCircle } from "lucide-react";

const shell = "rounded-3xl border-2 p-5 shadow-sm";

const TITLES = {
  checked_in: "Checked in on time",
  late: "Checked in late",
  checked_out: "Checked out",
  duplicate: "Already recorded",
};

// The big result card under the camera: accepted, rejected, verifying or waiting.
export default function ScanResultCard({ status }) {
  if (status.kind === "ok") {
    const { result } = status;
    return (
      <div className={`${shell} border-emerald-500 bg-emerald-50`}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-heading text-lg font-bold leading-snug text-emerald-900">{result.studentName}</p>
            <p className="mt-0.5 text-sm font-semibold text-emerald-800">
              {TITLES[result.result] || "Recorded"} {result.time ? `· ${result.time}` : ""}
            </p>
            <p className="mt-1 text-xs text-emerald-800">
              {result.result === "duplicate" ? "Nothing new was recorded." : "Status updated and the linked parent was notified."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className={`${shell} border-rose-500 bg-rose-50`}>
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-7 w-7 shrink-0 text-rose-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-heading text-lg font-bold leading-snug text-rose-900">{status.result?.message || "Not accepted"}</p>
            {status.result?.studentName && <p className="mt-0.5 text-sm text-rose-800">{status.result.studentName}</p>}
            <p className="mt-1 text-xs text-rose-800">Ask the student to open today's pass in the app and scan again.</p>
          </div>
        </div>
      </div>
    );
  }

  if (status.kind === "checking") {
    return (
      <div className={`${shell} border-border bg-card`}>
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          <p className="font-heading text-base font-semibold">Verifying pass…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shell} border-border bg-card`}>
      <div className="flex items-start gap-3">
        <ScanLine className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-heading text-base font-semibold">Ready to scan</p>
          <p className="mt-1 text-sm text-muted-foreground">Point the camera at the student's gate pass. The result appears here.</p>
        </div>
      </div>
    </div>
  );
}
