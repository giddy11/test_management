import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Props {
  // YYYY-MM-DD, or "" when unset. Both ends are inclusive.
  from: string
  to: string
  onFromChange: (from: string) => void
  onToChange: (to: string) => void
}

// "From [date] to [date]" filter with a clear button. Each picker is bounded by
// the other so an end date before the start date can't be chosen.
export function DateRangeFilter({ from, to, onFromChange, onToChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">From</span>
      <Input
        type="date"
        className="w-40"
        value={from}
        max={to || undefined}
        onChange={(e) => onFromChange(e.target.value)}
        aria-label="From date"
        data-cy="date-from"
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        className="w-40"
        value={to}
        min={from || undefined}
        onChange={(e) => onToChange(e.target.value)}
        aria-label="To date"
        data-cy="date-to"
      />
      {(from || to) && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear dates"
          onClick={() => {
            onFromChange("")
            onToChange("")
          }}
          data-cy="date-clear"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  )
}
