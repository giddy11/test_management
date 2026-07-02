import { cn } from "@/lib/utils"
import { usePresence } from "@/contexts/PresenceContext"

export function PresenceDot({ userId, className }: { userId: string; className?: string }) {
  const { isOnline } = usePresence()
  const online = isOnline(userId)

  return (
    <span
      className={cn(
        "block size-2.5 shrink-0 rounded-full ring-2 ring-background",
        online ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600",
        className
      )}
      title={online ? "Online" : "Offline"}
    />
  )
}
