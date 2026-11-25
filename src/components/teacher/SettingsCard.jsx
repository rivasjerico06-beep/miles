import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function SettingsCard({ settings, onSaved }) {
  const [values, setValues] = useState(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => setValues(settings), [settings]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.saveSettings({
        lateAfter: values.lateAfter,
        minCheckoutMinutes: Number(values.minCheckoutMinutes),
        avgSpeedKmh: Number(values.avgSpeedKmh),
      });
      toast.success("Settings saved. The scanner uses them from the next scan.");
      onSaved?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
        Scanner &amp; ETA settings
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="late-after">Late after</Label>
          <Input id="late-after" type="time" value={values.lateAfter} onChange={(e) => setValues({ ...values, lateAfter: e.target.value })} required disabled={busy} />
          <p className="text-[11px] leading-relaxed text-muted-foreground">Check-ins after this minute are marked late.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checkout-gap">Repeat-scan window (minutes)</Label>
          <Input id="checkout-gap" type="number" min={0} max={240} value={values.minCheckoutMinutes} onChange={(e) => setValues({ ...values, minCheckoutMinutes: e.target.value })} required disabled={busy} />
          <p className="text-[11px] leading-relaxed text-muted-foreground">A second scan sooner than this just confirms the check-in; later it is the check-out.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="avg-speed">Starting ETA speed (km/h)</Label>
          <Input id="avg-speed" type="number" min={4} max={60} step="0.5" value={values.avgSpeedKmh} onChange={(e) => setValues({ ...values, avgSpeedKmh: e.target.value })} required disabled={busy} />
          <p className="text-[11px] leading-relaxed text-muted-foreground">Used until the trip's own speed is known. Calibrate it with sample routes.</p>
        </div>
      </div>
      <Button type="submit" size="sm" className="mt-3" disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
        Save settings
      </Button>
    </form>
  );
}
