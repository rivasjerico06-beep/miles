import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GRADE_SECTIONS } from "@/lib/campus";

const CUSTOM = "__custom";

/**
 * Grade & section selector: the school's preset sections plus a free-text option.
 * Used for students' own section and for a teacher's advisory / handled section.
 */
export default function SectionPicker({ id, label = "Grade & section", hint, value, onChange, disabled }) {
  const [custom, setCustom] = useState(() => Boolean(value) && !GRADE_SECTIONS.includes(value));
  const selected = custom ? CUSTOM : GRADE_SECTIONS.includes(value) ? value : "";

  function pick(event) {
    const next = event.target.value;
    if (next === CUSTOM) {
      setCustom(true);
      onChange("");
      return;
    }
    setCustom(false);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={selected}
        onChange={pick}
        disabled={disabled}
        required={!custom}
        className="h-12 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      >
        <option value="">Select {label.toLowerCase()}…</option>
        {GRADE_SECTIONS.map((section) => (
          <option key={section} value={section}>
            {section}
          </option>
        ))}
        <option value={CUSTOM}>Other (custom)…</option>
      </select>
      {custom && (
        <Input
          id={`${id}-custom`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="e.g. 9 - Marie Curie"
          className="h-12"
          disabled={disabled}
          required
        />
      )}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}