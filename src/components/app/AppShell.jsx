import {
  Bell,
  ClipboardList,
  FlaskConical,
  History,
  LayoutDashboard,
  Link2,
  MapPin,
  Navigation,
  QrCode,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import ManilaClock from "@/components/app/ManilaClock";
import ProfileMenu from "@/components/app/ProfileMenu";
import { useCurrentUser } from "@/lib/session";
import { ROLE_LABELS, SCHOOL } from "@/lib/campus";

const NAV = {
  student: [
    { id: "gate-pass", label: "Gate pass", icon: QrCode },
    { id: "trip", label: "Trip home", icon: Navigation },
    { id: "home-map", label: "Home pin", icon: MapPin },
    { id: "parent-link", label: "Parent", icon: Link2 },
    { id: "activity", label: "History", icon: History },
  ],
  parent: [
    { id: "child-status", label: "Status", icon: LayoutDashboard },
    { id: "live-map", label: "Live map", icon: MapPin },
    { id: "alerts", label: "Alerts", icon: Bell },
    { id: "activity", label: "History", icon: History },
  ],
  teacher: [
    { id: "summary", label: "Summary", icon: LayoutDashboard },
    { id: "class-status", label: "Class", icon: ClipboardList },
    { id: "gate-scanner", label: "Scanner", icon: ScanLine },
    { id: "research", label: "Trials", icon: FlaskConical },
    { id: "settings", label: "Settings", icon: SlidersHorizontal },
  ],
};

function jumpTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <p className="font-display text-base font-bold tracking-tight text-foreground">
          Campus<span className="text-primary">Pulse</span>
        </p>
        <p className="hidden text-[11px] font-medium text-muted-foreground sm:block">{SCHOOL.shortName} · Antipolo City</p>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const user = useCurrentUser();
  const items = NAV[user?.role] || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-3 sm:px-5">
          <Brand />
          <div className="flex items-center gap-2">
            <ManilaClock className="hidden sm:inline-flex" />
            <span className="hidden rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary md:inline">
              {ROLE_LABELS[user?.role] || "Member"}
            </span>
            <ProfileMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-3 pb-28 pt-4 sm:px-5 lg:pb-10">
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-60 shrink-0 flex-col justify-between rounded-2xl border border-border bg-card p-3 lg:flex">
          <div>
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {ROLE_LABELS[user?.role]} workspace
            </p>
            <nav className="space-y-1">
              {items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => jumpTo(id)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="rounded-xl bg-secondary p-3 text-[11px] leading-relaxed text-secondary-foreground">
            <p className="flex items-center gap-1.5 font-semibold">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {SCHOOL.shortName}
            </p>
            <p className="mt-1 text-muted-foreground">{SCHOOL.address}</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
          {items.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => jumpTo(id)}
              className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors active:bg-accent"
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
