import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, KeyRound, Loader2, Mail, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SectionPicker from "@/components/auth/SectionPicker";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/session";

function PasswordForm({ onDone }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      toast.success("Password changed. Other devices were signed out.");
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required disabled={busy} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input id="new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required disabled={busy} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          Save password
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AdvisoryForm({ current, onDone }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.saveAdvisory(value);
      await queryClient.invalidateQueries();
      toast.success("Advisory section updated.");
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <SectionPicker id="advisory-edit" label="Advisory / handled grade & section" value={value} onChange={setValue} disabled={busy} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function AccountCard() {
  const user = useCurrentUser();
  const [mode, setMode] = useState(null);
  if (!user) return null;
  const isTeacher = user.role === "teacher";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold">Account</h2>
      <ul className="mt-2 space-y-2 text-xs">
        <li className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2.5">
          <span className="flex items-center gap-2 font-medium text-muted-foreground">
            <Mail className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Email
          </span>
          <span className="truncate font-semibold text-foreground">{user.email}</span>
        </li>
        {isTeacher && (
          <li className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2.5">
            <span className="flex items-center gap-2 font-medium text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Advisory
            </span>
            <span className="text-right font-semibold text-foreground">{user.gradeSection || "Not set"}</span>
          </li>
        )}
      </ul>

      {mode === "password" && <PasswordForm onDone={() => setMode(null)} />}
      {mode === "advisory" && <AdvisoryForm current={user.gradeSection} onDone={() => setMode(null)} />}

      {!mode && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("password")}>
            <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Change password
          </Button>
          {isTeacher && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("advisory")}>
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Edit advisory
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
