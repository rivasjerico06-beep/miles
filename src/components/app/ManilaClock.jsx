import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export default function ManilaClock({ className = "" }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const format = () =>
      new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(new Date());
    setTime(format());
    const id = setInterval(() => setTime(format()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium tabular-nums text-secondary-foreground ${className}`}
      title="Philippine Standard Time (Asia/Manila)"
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {time || "--:--:--"}
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">PHT</span>
    </span>
  );
}