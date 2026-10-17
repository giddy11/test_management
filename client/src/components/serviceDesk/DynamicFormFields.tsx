// components/serviceDesk/DynamicFormFields.tsx — renders a catalog item's
// form (built by an administrator in Catalog setup) and shows the answers
// back on a request. The server re-checks every answer against the same form
// (server/modules/serviceDesk/domain/formSchema.ts), so this is for comfort.
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FormField, FormValue, FormValues } from "@/types/serviceDesk.types"

interface Props {
  fields: FormField[]
  values: FormValues
  onChange: (key: string, value: FormValue | undefined) => void
  errors?: Record<string, string>
  disabled?: boolean
}

export function DynamicFormFields({ fields, values, onChange, errors = {}, disabled }: Props) {
  if (!fields.length) return null
  return (
    <div className="grid gap-4">
      {fields.map((f) => {
        const id = `field-${f.key}`
        const error = errors[f.key]
        const v = values[f.key]
        const label = (
          <Label htmlFor={id}>
            {f.label}
            {f.required && <span className="text-destructive"> *</span>}
          </Label>
        )
        const help = f.helpText && <p className="text-xs text-muted-foreground">{f.helpText}</p>
        const err = error && <p className="text-xs text-destructive">{error}</p>

        if (f.type === "checkbox") {
          return (
            <div key={f.key} className="grid gap-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={v === true}
                  disabled={disabled}
                  onCheckedChange={(c) => onChange(f.key, c === true)}
                />
                <Label htmlFor={id} className="font-normal">{f.label}</Label>
              </div>
              {help}
              {err}
            </div>
          )
        }

        let control: React.ReactNode
        switch (f.type) {
          case "textarea":
            control = (
              <Textarea
                id={id}
                rows={4}
                value={typeof v === "string" ? v : ""}
                disabled={disabled}
                aria-invalid={Boolean(error)}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )
            break
          case "number":
            control = (
              <Input
                id={id}
                type="number"
                value={typeof v === "number" || typeof v === "string" ? String(v) : ""}
                disabled={disabled}
                aria-invalid={Boolean(error)}
                onChange={(e) => onChange(f.key, e.target.value === "" ? undefined : Number(e.target.value))}
              />
            )
            break
          case "date":
            control = (
              <Input
                id={id}
                type="date"
                value={typeof v === "string" ? v : ""}
                disabled={disabled}
                aria-invalid={Boolean(error)}
                onChange={(e) => onChange(f.key, e.target.value || undefined)}
              />
            )
            break
          case "select":
            control = (
              <Select value={typeof v === "string" ? v : ""} onValueChange={(val) => onChange(f.key, val)} disabled={disabled}>
                <SelectTrigger id={id} aria-invalid={Boolean(error)} className="w-full">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {(f.options ?? []).map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
            break
          case "multiselect": {
            const picked = Array.isArray(v) ? v : []
            control = (
              <div id={id} className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border p-3">
                {(f.options ?? []).map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={picked.includes(o)}
                      disabled={disabled}
                      onCheckedChange={(c) => {
                        const next = c === true ? [...picked, o] : picked.filter((p) => p !== o)
                        onChange(f.key, next.length ? next : undefined)
                      }}
                    />
                    {o}
                  </label>
                ))}
              </div>
            )
            break
          }
          default:
            control = (
              <Input
                id={id}
                value={typeof v === "string" ? v : ""}
                disabled={disabled}
                aria-invalid={Boolean(error)}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )
        }

        return (
          <div key={f.key} className="grid gap-1.5">
            {label}
            {control}
            {help}
            {err}
          </div>
        )
      })}
    </div>
  )
}

// Read-only answers, in the order the form asked them.
export function FormAnswers({ fields, values }: { fields: FormField[]; values: FormValues }) {
  const rows = fields.filter((f) => values[f.key] !== undefined)
  if (!rows.length) return null
  const show = (f: FormField, v: FormValue) => {
    if (f.type === "checkbox") return v ? "Yes" : "No"
    if (Array.isArray(v)) return v.join(", ")
    if (f.type === "date" && typeof v === "string") return new Date(`${v}T00:00:00`).toLocaleDateString()
    return String(v)
  }
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((f) => (
        <div key={f.key} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{f.label}</dt>
          <dd className="whitespace-pre-wrap break-words text-sm">{show(f, values[f.key])}</dd>
        </div>
      ))}
    </dl>
  )
}

