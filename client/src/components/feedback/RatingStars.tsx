// Read-only 1-5 star display for a submitter's satisfaction rating.
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

export function RatingStars({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= value ? "size-3.5 fill-amber-400 text-amber-400" : "size-3.5 text-muted-foreground/30"
          }
        />
      ))}
    </div>
  )
}
