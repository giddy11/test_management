import { FilterX } from "lucide-react"
import { Button } from "@/components/ui/button"

// Resets every filter on a list's toolbar back to its default in one click.
// Renders nothing when no filter is active, so it never sits there doing
// nothing — the caller passes whether any of its own filter state is set.
export function ClearFiltersButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  if (!active) return null
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} data-cy="clear-filters">
      <FilterX className="mr-1 size-4" /> Clear filters
    </Button>
  )
}
