import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingScreen({ label = "Loading…" }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function LoadError({ title, error, onRetry }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
      <p className="font-display font-semibold text-destructive">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{error?.message || "Please try again."}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="font-display text-6xl font-bold tracking-tight text-primary">404</p>
      <p className="text-muted-foreground">The page you are looking for does not exist.</p>
      <Button asChild>
        <Link to="/">Go to CampusPulse</Link>
      </Button>
    </div>
  );
}

export function ErrorScreen({ error }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="font-display text-xl font-bold">Something went wrong</p>
      <p className="text-sm text-muted-foreground">{error?.message || "Please reload the page."}</p>
      <Button type="button" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}
