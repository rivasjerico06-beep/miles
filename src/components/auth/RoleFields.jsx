import { ClipboardCheck, GraduationCap, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SectionPicker from "@/components/auth/SectionPicker";

export const ROLE_OPTIONS = [
  { value: "student", label: "Student", hint: "Gate pass, trip home", icon: GraduationCap },
  { value: "parent", label: "Parent", hint: "Alerts & live ETA", icon: Users },
  { value: "teacher", label: "Teacher", hint: "Class status", icon: ClipboardCheck },
];

export function RoleSelect({ value, onChange, disabled }) {
  return (
    <div>
      <Label className="mb-2 block">I am a…</Label>
      <div className="grid grid-cols-3 gap-2">
        {ROLE_OPTIONS.map(({ value: role, label, hint, icon: Icon }) => {
          const active = value === role;
          return (
            <button
              key={role}
              type="button"
              disabled={disabled}
              onClick={() => onChange(role)}
              aria-pressed={active}
              className={`flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-colors ${
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-accent"
              } disabled:opacity-60`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextField({ id, label, hint, mono = false, ...props }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className={`h-12 ${mono ? "font-mono tracking-wide" : ""}`} {...props} />
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The role-specific part of the sign-up form. */
export default function RoleFields({ role, values, onChange, disabled }) {
  const set = (key) => (event) => onChange({ ...values, [key]: event.target.value });
  const setValue = (key) => (next) => onChange({ ...values, [key]: next });

  if (role === "student") {
    return (
      <div className="space-y-4">
        <TextField id="student-number" label="Student number" placeholder="2026-0001" inputMode="numeric" mono value={values.studentNumber} onChange={set("studentNumber")} disabled={disabled} required />
        <SectionPicker id="grade-section" value={values.gradeSection} onChange={setValue("gradeSection")} disabled={disabled} hint="Pick your section, or choose “Other” to type it in." />
      </div>
    );
  }

  if (role === "parent") {
    return (
      <div className="space-y-4">
        <TextField id="child-number" label="Your child's student number" placeholder="2026-0001" inputMode="numeric" mono value={values.childStudentNumber} onChange={set("childStudentNumber")} disabled={disabled} required />
        <TextField
          id="link-code"
          label="Parent link code"
          placeholder="ABCD-EFGH"
          autoCapitalize="characters"
          mono
          value={values.linkCode}
          onChange={set("linkCode")}
          disabled={disabled}
          required
          hint="Your child makes this code in their CampusPulse app (Parent section). It links your account to theirs only."
        />
      </div>
    );
  }

  if (role === "teacher") {
    return (
      <div className="space-y-4">
        <SectionPicker id="advisory-section" label="Advisory / handled grade & section" value={values.gradeSection} onChange={setValue("gradeSection")} disabled={disabled} hint="Your dashboard opens on this section. You can switch to all sections anytime." />
        <TextField id="teacher-code" label="Teacher access code" placeholder="ACN-XXXX-XXXX" autoCapitalize="characters" mono value={values.teacherCode} onChange={set("teacherCode")} disabled={disabled} required hint="Given by the CampusPulse research team. Teacher accounts see attendance only, never student locations." />
      </div>
    );
  }

  return null;
}
