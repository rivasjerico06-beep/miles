import { GraduationCap, Link2, MapPin } from "lucide-react";
import { formatManilaDate, formatManilaTime, statusTone } from "@/lib/campus";

export default function ChildStatusCard({ child, today, trip, clock }) {
  const status = today?.status || "Not checked in yet";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_10px_30px_-26px_rgba(219,39,119,0.6)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent">
            <GraduationCap className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold leading-tight">{child.fullName}</h2>
            <p className="font-mono text-xs text-muted-foreground">{child.studentNumber}</p>
            <p className="text-xs text-muted-foreground">{child.gradeSection}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(today?.status)}`}>{status}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-secondary/70 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Check-in</p>
          <p className="text-sm font-semibold">{formatManilaTime(today?.checkInAt)}</p>
          {today?.late && <p className="text-[10px] font-semibold text-amber-700">Late</p>}
        </div>
        <div className="rounded-xl bg-secondary/70 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Check-out</p>
          <p className="text-sm font-semibold">{formatManilaTime(today?.checkOutAt)}</p>
        </div>
        <div className="rounded-xl bg-secondary/70 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Home</p>
          <p className="text-sm font-semibold">{formatManilaTime(today?.arrivedHomeAt)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Link2 className="h-3 w-3 text-primary" aria-hidden="true" />
          Linked to your account only
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-primary" aria-hidden="true" />
          {trip?.status === "active" ? `Location updated ${formatManilaTime(trip.lastFixAt)}` : "Location is shared only on the trip home"}
        </span>
        <span>{formatManilaDate(clock.dateKey)}</span>
      </div>
    </div>
  );
}
