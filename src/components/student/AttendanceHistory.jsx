import { History } from "lucide-react";
import { formatManilaDate, formatManilaTime, statusTone } from "@/lib/campus";

export default function AttendanceHistory({ history = [], title = "My attendance history" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <History className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </h2>

      {history.length === 0 ? (
        <p className="mt-3 rounded-xl bg-secondary px-3 py-4 text-sm text-secondary-foreground">
          No attendance records yet. Your first gate scan will appear here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {history.map((record) => (
            <li key={record.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{formatManilaDate(record.date)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  In {formatManilaTime(record.checkInAt)} · Out {formatManilaTime(record.checkOutAt)}
                  {record.arrivedHomeAt ? ` · Home ${formatManilaTime(record.arrivedHomeAt)}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(record.status)}`}>
                {record.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}