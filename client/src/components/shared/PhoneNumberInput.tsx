// components/shared/PhoneNumberInput.tsx
// A phone number field with a country-code dropdown (reuses the same
// country-state-city data already used for the address fields) — combines the
// selected dial code and the typed local digits into a single E.164 value.
import { useEffect, useMemo, useState } from "react"
import { Country } from "country-state-city"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

interface Props {
  value: string | null
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  className?: string
}

const ALL_COUNTRIES = Country.getAllCountries().filter((c) => c.phonecode)
// Longest dial code first, so matching an existing number's prefix below picks
// the most specific code (e.g. a 3-digit code before a coincidental 1-digit one).
const BY_CODE_LENGTH_DESC = [...ALL_COUNTRIES].sort((a, b) => b.phonecode.length - a.phonecode.length)
const ALPHABETICAL = [...ALL_COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))

const DEFAULT_ISO = "NG"

function splitE164(value: string | null): { iso: string; local: string } {
  const digits = (value ?? "").replace(/^\+/, "")
  if (!digits) return { iso: DEFAULT_ISO, local: "" }
  const match = BY_CODE_LENGTH_DESC.find((c) => digits.startsWith(c.phonecode))
  return match ? { iso: match.isoCode, local: digits.slice(match.phonecode.length) } : { iso: DEFAULT_ISO, local: digits }
}

export function PhoneNumberInput({ value, onChange, id, placeholder = "8012345678", className }: Props) {
  const [iso, setIso] = useState(() => splitE164(value).iso)
  const [local, setLocal] = useState(() => splitE164(value).local)
  // Re-split only when `value` is swapped wholesale from outside (e.g. a
  // record loads after this component already mounted) — not on every emit.
  // Normalised to a plain string (never null) so it compares consistently
  // with `value ?? ""` below — otherwise picking a country before typing any
  // digits emits "" while this stays null, "" !== null looks like an outside
  // change, and the re-sync effect immediately reverts the country back to
  // the default.
  const [syncedWith, setSyncedWith] = useState(() => value ?? "")

  useEffect(() => {
    const incoming = value ?? ""
    if (incoming === syncedWith) return
    const split = splitE164(value)
    setIso(split.iso)
    setLocal(split.local)
    setSyncedWith(incoming)
  }, [value, syncedWith])

  const dialCode = useMemo(() => ALL_COUNTRIES.find((c) => c.isoCode === iso)?.phonecode ?? "", [iso])

  const emit = (nextIso: string, nextLocal: string) => {
    const code = ALL_COUNTRIES.find((c) => c.isoCode === nextIso)?.phonecode ?? ""
    const digits = nextLocal.replace(/\D/g, "").replace(/^0+/, "")
    const next = digits ? `+${code}${digits}` : ""
    setSyncedWith(next)
    onChange(next)
  }

  return (
    <div className={["flex gap-2", className].filter(Boolean).join(" ")}>
      <Select
        value={iso}
        onValueChange={(nextIso) => {
          setIso(nextIso)
          emit(nextIso, local)
        }}
      >
        <SelectTrigger className="w-24 shrink-0" aria-label="Country code">
          <SelectValue>{dialCode ? `+${dialCode}` : "Code"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ALPHABETICAL.map((c) => (
            <SelectItem key={c.isoCode} value={c.isoCode}>
              {c.flag} {c.name} (+{c.phonecode})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        value={local}
        onChange={(e) => {
          setLocal(e.target.value)
          emit(iso, e.target.value)
        }}
        placeholder={placeholder}
        className="flex-1"
        inputMode="tel"
      />
    </div>
  )
}
