import { useState } from "react";
import { Download, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatManilaTime, statusTone } from "@/lib/campus";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "On Campus", label: "On campus" },
  { key: "Late", label: "Late" },
  { key: "Checked Out", label: "Checked out" },
  { key: "Arrived Home", label: "Arrived home" },
  { key: "Unaccounted", label: "Unaccounted" },
];

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function ClassTable({ rows, clock, advisory, scope }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const visible = rows.filter((row) => {
    const matchesFilter = filter === "all" || row.status === filter;
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      row.fullName.toLowerCase().includes(term) ||
      row.studentNumber.toLowerCase().includes(term) ||
      row.gradeSection.toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  });

  function exportCsv() {
    const header = ["Student Number", "Full Name", "Grade & Section", "Status", "Late", "Check-in", "Check-in via", "Check-out", "Check-out via", "Parent linked"];
    const body = visible.map((row) => [
      row.studentNumber,
      row.fullName,
      row.gradeSection,
      row.status,
      row.late ? "Yes" : "No",
      row.checkInAt ? new Date(row.checkInAt).toISOString() : "",
      row.checkInVia,
      row.checkOutAt ? new Date(row.checkOutAt).toISOString() : "",
      row.checkOutVia,
      row.parentLinked ? "Yes" : "No",
    ]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `campuspulse-class-status-${clock.dateKey}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">
            Class status table
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              {scope === "advisory" && advisory ? advisory : "All sections"}
            </span>
          </h2>
          <Button type="button" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, student number, or section"
          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === option.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Student</th>
              <th className="px-4 py-2.5 font-semibold">Grade &amp; section</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">In</th>
              <th className="px-4 py-2.5 font-semibold">Out</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No students match this search.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.studentNumber} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{row.fullName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{row.studentNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.gradeSection || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(row.status)}`}>
                      {row.status}
                    </span>
                    {row.late && row.status !== "Late" && <span className="ml-1.5 text-[11px] font-semibold text-amber-700">was late</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatManilaTime(row.checkInAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatManilaTime(row.checkOutAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-1.5 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
        Location, home pins, routes and ETAs are never available to teacher accounts.
      </p>
    </div>
  );
}