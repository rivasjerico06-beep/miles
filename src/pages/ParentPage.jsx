import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import AccountCard from "@/components/app/AccountCard";
import { LoadError, LoadingScreen } from "@/components/app/StatusScreens";
import ChildMapCard from "@/components/parent/ChildMapCard";
import ChildStatusCard from "@/components/parent/ChildStatusCard";
import NotificationsCard from "@/components/parent/NotificationsCard";
import AttendanceHistory from "@/components/student/AttendanceHistory";
import { api } from "@/lib/api";
import { POLL_MS, formatManilaTime, mapsPinUrl } from "@/lib/campus";
import { buzz, chime, showLocalNotification } from "@/lib/notify";

function SosBanner({ alert, childName, onResolved }) {
  const [busy, setBusy] = useState(false);
  async function resolve() {
    setBusy(true);
    try {
      await api.resolveSos(alert.id);
      toast.success("Marked as safe.");
      onResolved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  const where =
    alert.locationSource === "live" ? "live location" : alert.locationSource === "last_known" ? "last known location" : "no location available";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <Siren className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-display text-sm font-bold text-destructive">SOS from {childName} at {formatManilaTime(alert.createdAt)}</p>
          <p className="text-xs text-destructive/80">Sent with {where}. Call your child and the authorities if needed.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {alert.lat != null && (
          <Button asChild size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            <a href={mapsPinUrl(alert.lat, alert.lng)} target="_blank" rel="noreferrer">
              Open location
            </a>
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={resolve} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Mark as safe
        </Button>
      </div>
    </div>
  );
}

export default function ParentPage() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["parent-dashboard"],
    queryFn: api.parentDashboard,
    refetchInterval: POLL_MS.parent,
  });

  // Sound, vibration and a phone notification for alerts that arrive while the page is open.
  const seen = useRef(null);
  useEffect(() => {
    if (!data?.notices) return;
    if (seen.current === null) {
      seen.current = new Set(data.notices.map((notice) => notice.id));
      return;
    }
    const fresh = data.notices.filter((notice) => !seen.current.has(notice.id));
    data.notices.forEach((notice) => seen.current.add(notice.id));
    if (fresh.length === 0) return;
    const latest = fresh[0];
    chime();
    buzz(latest.type === "sos" ? [400, 150, 400, 150, 400] : [160, 80, 160]);
    toast(latest.title, { description: latest.body });
    showLocalNotification(latest);
  }, [data]);

  if (isPending) return <LoadingScreen label="Loading your child's status…" />;
  if (error) return <LoadError title="We couldn't load your child's status" error={error} onRetry={refetch} />;
  if (!data.child) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-display font-semibold">No student is linked to this account</p>
        <p className="mt-1 text-sm text-muted-foreground">Ask the CampusPulse research team to check your child's account.</p>
      </div>
    );
  }

  const openAlerts = (data.alerts || []).filter((alert) => alert.status === "open");

  return (
    <div className="space-y-4 pb-8">
      {openAlerts.map((alert) => (
        <SosBanner key={alert.id} alert={alert} childName={data.child.fullName} onResolved={refetch} />
      ))}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section id="child-status" className="scroll-mt-20">
            <ChildStatusCard child={data.child} today={data.today} trip={data.trip} clock={data.clock} />
          </section>
          <section id="live-map" className="scroll-mt-20">
            <ChildMapCard data={data} />
          </section>
          <section id="activity" className="scroll-mt-20">
            <AttendanceHistory history={data.history} title={`${data.child.fullName.split(" ")[0]}'s attendance`} />
          </section>
        </div>
        <aside className="space-y-4">
          <section id="alerts" className="scroll-mt-20">
            <NotificationsCard notices={data.notices} unread={data.unread} onChanged={refetch} />
          </section>
          <AccountCard />
        </aside>
      </div>
    </div>
  );
}
