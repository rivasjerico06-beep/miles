import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, KeyRound, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatManilaDateTime } from "@/lib/campus";

export default function ParentLinkCard({ student, onChanged }) {
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);

  async function makeCode() {
    setBusy(true);
    try {
      setCode(await api.createLinkCode());
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code.code);
      toast.success("Code copied.");
    } catch {
      toast("Write the code down or show this screen to your parent.");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
        Parent account
      </h2>

      {student.parentLinked ? (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-xs leading-relaxed text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Linked to <span className="font-semibold">{student.parentName || "your parent"}</span>. They get your check-in,
            check-out, ETA, arrival and SOS alerts.
          </span>
        </p>
      ) : code ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-3">
            <span className="whitespace-nowrap font-mono text-xl font-bold tracking-[0.12em] text-foreground">{code.code}</span>
            <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label="Copy code">
              <Copy className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Your parent creates a CampusPulse account as “Parent” and enters your student number{" "}
            <span className="font-mono font-semibold text-foreground">{student.studentNumber}</span> and this code. It works
            once, until {formatManilaDateTime(code.expiresAt)}.
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            No parent is linked yet. Make a one-time code and give it to your parent so only they can follow your status.
            {student.linkCodeExpiresAt ? " Making a new code cancels the old one." : ""}
          </p>
          <Button type="button" size="sm" onClick={makeCode} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            Make a parent link code
          </Button>
        </div>
      )}
    </div>
  );
}
