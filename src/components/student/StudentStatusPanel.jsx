import { Clock, Home, Link2, LogIn, LogOut, Navigation } from "lucide-react";
import { formatManilaDate, formatManilaTime, hasHomePin, statusTone } from "@/lib/campus";

function Row({ icon: Icon, label, value, ok }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {label}
      </span>
      <span className={`text-right text-xs font-semibold ${ok ? "text-success" : "text-foreground"}`}>{value}</span>
    </li>
  );
}

const TRIP_LABEL = { active: "Sharing live", arrived: "Arrived home", stopped: "Stopped" };

export default function StudentStatusPanel({ data }) {
  const { student, today, trip, clock, settings } = data;
  const status = today?.status || "Not checked in yet";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold">Today · {formatManilaDate(clock.dateKey)}</h2>
      <div className="mt-2 rounded-xl border border-border bg-secondary/60 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Class status</p>
        <span className={`mt-1.5 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(today?.status)}`}>{status}</span>
      </div>
      <ul className="mt-2 divide-y divide-border">
        <Row icon={LogIn} label="Check-in" value={formatManilaTime(today?.checkInAt)} ok={Boolean(today?.checkInAt)} />
        <Row icon={LogOut} label="Check-out" value={formatManilaTime(today?.checkOutAt)} ok={Boolean(today?.checkOutAt)} />
        <Row icon={Navigation} label="Trip home" value={TRIP_LABEL[trip?.status] || "Not started"} ok={trip?.status === "arrived"} />
        <Row icon={Home} label="Home pin" value={hasHomePin(student) ? "Saved" : "Not set"} ok={hasHomePin(student)} />
        <Row icon={Link2} label="Parent" value={student.parentLinked ? "Linked" : "Not linked"} ok={student.parentLinked} />
        <Row icon={Clock} label="Late after" value={settings.lateAfterLabel} />
      </ul>
    </div>
  );
}
