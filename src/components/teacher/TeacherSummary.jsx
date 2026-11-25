import { CheckCircle2, Clock, DoorOpen, RefreshCw, ShieldOff, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatManilaDate } from "@/lib/campus";

const CARDS = [
  { key: "onCampus", label: "On campus", icon: CheckCircle2, className: "text-success", ring: "border-success/30 bg-success/5" },
  { key: "late", label: "Late", icon: Clock, className: "text-amber-600", ring: "border-amber-200 bg-amber-50" },
  { key: "checkedOut", label: "Checked out", icon: DoorOpen, className: "text-sky-600", ring: "border-sky-200 bg-sky-50" },
  { key: "unaccounted", label: "Unaccounted", icon: UserX, className: "text-muted-foreground", ring: "border-border bg-secondary/60" },
];

const SCOPES = [
  { key: "advisory", label: "My advisory" },
  { key: "all", label: "All sections" },
];

export default function TeacherSummary({ counts, clock, advisory, scope, lateAfterLabel, onScopeChange, onRefresh, refreshing }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">Class status today</h1>
          <p className="text-xs text-muted-foreground">
            {advisory ? `Advisory: ${advisory} · ` : "No advisory section set · "}
            {formatManilaDate(clock.dateKey)} · {counts.total} student{counts.total === 1 ? "" : "s"} · Asia/Manila
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="flex rounded-xl bg-secondary p-1 sm:w-72">
        {SCOPES.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onScopeChange(option.key)}
            aria-pressed={scope === option.key}
            disabled={option.key === "advisory" && !advisory}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              scope === option.key ? "bg-card text-primary shadow-sm" : "text-secondary-foreground/70"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARDS.map(({ key, label, icon: Icon, className, ring }) => (
          <div key={key} className={`rounded-2xl border p-4 ${ring}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {key === "late" && lateAfterLabel ? `Late (after ${lateAfterLabel})` : label}
              </p>
              <Icon className={`h-4 w-4 ${className}`} aria-hidden="true" />
            </div>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums text-foreground">{counts[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        Location privacy: this workspace shows attendance only. Student GPS, home pins, routes, and ETAs are never
        available to teacher accounts.
      </p>
    </div>
  );
}