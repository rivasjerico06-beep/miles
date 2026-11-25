import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, PhoneCall, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { buzz } from "@/lib/notify";

function currentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}

export default function SosButton({ variant = "card" }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const coords = await currentPosition();
      const result = await api.sos(coords ?? {});
      buzz([300, 120, 300, 120, 300]);
      const where = {
        live: "with your live location",
        last_known: "with your last known location",
        none: "but your location was not available",
      }[result.locationSource];
      toast.success(result.parentLinked ? `SOS sent to your parent ${where}.` : "SOS saved, but no parent is linked yet.");
    } catch (err) {
      toast.error(err?.message || "Could not send the SOS alert.");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const trigger =
    variant === "strip" ? (
      <Button
        type="button"
        className="h-12 w-full bg-destructive text-base font-bold text-destructive-foreground shadow-lg shadow-destructive/30 hover:bg-destructive/90"
      >
        <Siren className="mr-2 h-5 w-5" aria-hidden="true" />
        SOS Emergency Alert
      </Button>
    ) : (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Emergency
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Sends your exact GPS pin to your linked parent immediately.
        </p>
        <Button
          type="button"
          className="mt-3 h-12 w-full bg-destructive text-base font-bold text-destructive-foreground hover:bg-destructive/90"
        >
          <Siren className="mr-2 h-5 w-5" aria-hidden="true" />
          SOS Emergency Alert
        </Button>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <PhoneCall className="h-3 w-3" aria-hidden="true" />
          For emergencies that need responders, call local authorities too.
        </p>
      </div>
    );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send an SOS alert?</AlertDialogTitle>
          <AlertDialogDescription>
            Your linked parent is notified right away with your current GPS pin. Use this only in a real emergency.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              send();
            }}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Send SOS now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}