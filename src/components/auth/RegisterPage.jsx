import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout, FormError } from "@/components/auth/AuthLayout";
import RoleFields, { RoleSelect } from "@/components/auth/RoleFields";
import { api } from "@/lib/api";
import { roleHome } from "@/lib/campus";
import { sessionQuery } from "@/lib/session";

export default function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [role, setRole] = useState(null);
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    password: "",
    studentNumber: "",
    gradeSection: "",
    childStudentNumber: "",
    linkCode: "",
    teacherCode: "",
  });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!role) return setError("Choose whether you are a student, parent, or teacher.");
    if (!consent) return setError("Please read and accept the data privacy notice.");
    setBusy(true);
    try {
      const { user } = await api.register({ role, ...values });
      queryClient.setQueryData(sessionQuery.queryKey, { user });
      navigate({ to: roleHome(user.role), replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="One account per person. Your role can't be changed later."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <FormError>{error}</FormError>
      <form onSubmit={submit} className="space-y-5">
        <RoleSelect value={role} onChange={setRole} disabled={busy} />

        {role && (
          <>
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input id="full-name" value={values.fullName} onChange={set("fullName")} placeholder="Juan Dela Cruz" autoComplete="name" className="h-12" disabled={busy} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="email" type="email" value={values.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" className="h-12 pl-10" disabled={busy} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="password" type="password" value={values.password} onChange={set("password")} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} className="h-12 pl-10" disabled={busy} required />
              </div>
            </div>

            <RoleFields role={role} values={values} onChange={setValues} disabled={busy} />

            <label className="flex items-start gap-2.5 rounded-xl bg-secondary px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
              <span>
                I agree that CampusPulse stores my account details and attendance records for this study, and, for students,
                shares my phone's location with my linked parent only during the trip home and when I press SOS (Data
                Privacy Act of 2012, RA 10173).
              </span>
            </label>

            <Button type="submit" className="h-12 w-full font-semibold" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? "Creating your account…" : "Create account"}
            </Button>
          </>
        )}
      </form>
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        Parents: create your account after your child, using the link code from their app.
      </p>
    </AuthLayout>
  );
}
