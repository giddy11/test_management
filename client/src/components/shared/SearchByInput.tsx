import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface SearchByOption<T extends string> {
  value: T
  label: string
  placeholder: string
}

interface Props<T extends string> {
  options: readonly SearchByOption<T>[]
  field: T
  onFieldChange: (field: T) => void
  value: string
  onValueChange: (value: string) => void
  className?: string
}

// A search box plus a "search by" picker that says which field the text is
// matched against (title, reporter, …). The parent owns both values and decides
// what to send to the API.
export function SearchByInput<T extends string>({
  options,
  field,
  onFieldChange,
  value,
  onValueChange,
  className,
}: Props<T>) {
  const active = options.find((o) => o.value === field) ?? options[0]

  return (
    <div className={cn("flex gap-2", className)}>
      <Select value={active.value} onValueChange={(v) => onFieldChange(v as T)}>
        <SelectTrigger aria-label="Search by" className="w-32 shrink-0" data-cy="search-by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder={active.placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="min-w-0 flex-1"
      />
    </div>
  )
}
