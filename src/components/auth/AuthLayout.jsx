import { ClipboardCheck, GraduationCap, HeartPulse, Users } from "lucide-react";

const ROLES = [
  { icon: GraduationCap, label: "Student", copy: "Daily one-time QR gate pass, trip home and SOS" },
  { icon: Users, label: "Parent", copy: "Check-in, dismissal, ETA and arrival alerts" },
  { icon: ClipboardCheck, label: "Teacher", copy: "Real-time class status without location data" },
];

function Wordmark({ light = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <HeartPulse className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className={`font-display text-xl font-bold tracking-tight ${light ? "text-white" : "text-foreground"}`}>
        Campus<span className={light ? "text-white/70" : "text-primary"}>Pulse</span>
      </span>
    </div>
  );
}

// Full-screen split layout shared by the login and sign-up pages.
export function AuthLayout({ icon: Icon, title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl lg:grid-cols-[1.02fr_1fr]">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#EC4899] via-[#DB2777] to-[#9D174D] p-10 lg:flex lg:flex-col lg:justify-between">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <Wordmark light />
            <h2 className="mt-10 max-w-sm font-display text-3xl font-bold leading-tight text-white">
              Real-time student class status, before, during and after class.
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/80">
              Antipolo City National Science and Technology High School · ESP32-CAM gate scanner, parent notifications and GPS
              tracking
            </p>
          </div>
          <ul className="relative mt-10 space-y-3">
            {ROLES.map(({ icon: RoleIcon, label, copy }) => (
              <li key={label} className="flex items-start gap-3 rounded-2xl border border-white/20 bg-white/10 p-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <RoleIcon className="h-4 w-4 text-white" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-xs leading-relaxed text-white/75">{copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <Wordmark />
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">ACNSTHS · Real-Time Class Status</p>
            </div>
            <div className="rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-[0_18px_40px_-28px_rgba(219,39,119,0.45)] sm:p-8">
              <div className="mb-6">
                {Icon && (
                  <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </span>
                )}
                <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
                {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              {children}
            </div>
            {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
            <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              Data Privacy Act of 2012 (RA 10173): location is shared only with the linked parent, only during the trip home,
              and never with teachers.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
      {children}
    </div>
  );
}
