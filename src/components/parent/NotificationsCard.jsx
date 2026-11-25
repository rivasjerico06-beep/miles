import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, CheckCheck, Clock, Home, Loader2, LogIn, LogOut, MapPinOff, Navigation, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatManilaTime } from "@/lib/campus";
import { buzz, chime, currentPushState, enablePhoneAlerts, needsHomeScreenInstall } from "@/lib/notify";

const TYPE_STYLE = {
  check_in: { icon: LogIn, className: "bg-success/10 text-success" },
  late: { icon: Clock, className: "bg-amber-100 text-amber-700" },
  check_out: { icon: LogOut, className: "bg-sky-100 text-sky-700" },
  eta: { icon: Navigation, className: "bg-primary/10 text-primary" },
  arrived_home: { icon: Home, className: "bg-violet-100 text-violet-700" },
  trip_stopped: { icon: MapPinOff, className: "bg-amber-100 text-amber-700" },
  sos: { icon: Siren, className: "bg-destructive/10 text-destructive" },
};

const PUSH_LABEL = {
  subscribed: "Phone alerts are on",
  granted: "Finish turning on alerts",
  default: "Turn on phone alerts",
  denied: "Alerts blocked in browser",
  unsupported: "Alerts not supported here",
};

export default function NotificationsCard({ notices = [], unread = 0, onChanged }) {
  const [pushState, setPushState] = useState("default");
  const [busy, setBusy] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    currentPushState().then(setPushState).catch(() => setPushState("unsupported"));
    setIosHint(needsHomeScreenInstall());
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const result = await enablePhoneAlerts();
      if (result.state === "granted") {
        setPushState(result.push ? "subscribed" : "granted");
        chime();
        buzz();
        toast.success(
          result.push
            ? "Phone alerts are on. You'll be notified even when CampusPulse is closed."
            : "Alerts are on while CampusPulse is open on this phone.",
        );
      } else {
        setPushState(result.state);
        toast.error(result.state === "denied" ? "Alerts are blocked. Allow notifications for this site in your browser settings." : "This browser can't show notifications.");
      }
    } catch (error) {
      toast.error(error.message || "Could not turn on phone alerts.");
    } finally {
      setBusy(false);
    }
  }

  async function markAll() {
    try {
      await api.markNoticesRead();
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
            Alerts
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unread > 0 ? `${unread} unread update${unread > 1 ? "s" : ""}` : "You're all caught up"}
          </p>
        </div>
        {unread > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={markAll}>
            <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Mark read
          </Button>
        )}
      </div>

      <Button
        type="button"
        onClick={enable}
        disabled={busy || pushState === "subscribed" || pushState === "unsupported"}
        variant={pushState === "subscribed" ? "secondary" : "default"}
        className="mt-3 h-auto min-h-11 w-full whitespace-normal py-2 font-semibold"
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Bell className="mr-2 h-4 w-4" aria-hidden="true" />}
        {PUSH_LABEL[pushState] || PUSH_LABEL.default}
      </Button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {iosHint
          ? "On iPhone: tap Share → Add to Home Screen, open CampusPulse from there, then turn on alerts."
          : pushState === "denied"
            ? "Allow notifications for this site in your browser settings, then reload. Updates still appear here automatically."
            : "Alerts arrive on this phone even when the app is closed. Updates also appear here automatically."}
      </p>

      {notices.length === 0 ? (
        <p className="mt-3 rounded-xl bg-secondary px-3 py-4 text-sm text-secondary-foreground">
          No alerts yet. Check-in, late, check-out, ETA, arrival and SOS updates will appear here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notices.map((notice) => {
            const style = TYPE_STYLE[notice.type] || TYPE_STYLE.check_in;
            const Icon = style.icon;
            return (
              <li
                key={notice.id}
                className={`flex items-start gap-2.5 rounded-xl border p-2.5 ${notice.read ? "border-border bg-card" : "border-primary/25 bg-primary/5"}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.className}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-snug text-foreground">{notice.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{notice.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {formatManilaTime(notice.eventAt)}
                    </span>
                    {notice.mapsUrl && (
                      <a href={notice.mapsUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-primary hover:underline">
                        Open location
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
