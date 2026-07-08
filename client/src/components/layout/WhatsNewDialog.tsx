// Shows company admins the app updates they haven't seen yet, once.
// Dismissing marks everything published so far as seen.
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { wrapCall } from "@/transport/http"
import { useAuth } from "@/contexts/AuthContext"

interface AppUpdate {
  id: string
  title: string
  body: string
  createdAt: string
}

const UNSEEN_KEY = ["app-updates", "unseen"]

export function WhatsNewDialog() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"
  const [open, setOpen] = useState(false)

  const { data: updates = [] } = useQuery({
    queryKey: UNSEEN_KEY,
    queryFn: async () => {
      const res = await wrapCall<AppUpdate[]>("GET", "/api/v1/app-updates/unseen")
      return res.success ? res.data ?? [] : []
    },
    enabled: isAdmin,
    staleTime: Infinity,
  })

  const markSeen = useMutation({
    mutationFn: () => wrapCall<null>("POST", "/api/v1/app-updates/seen"),
    onSettled: () => qc.setQueryData(UNSEEN_KEY, []),
  })

  useEffect(() => {
    if (updates.length > 0) setOpen(true)
  }, [updates.length])

  const dismiss = () => {
    setOpen(false)
    markSeen.mutate()
  }

  if (!isAdmin || updates.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> What's new in TestMate
          </DialogTitle>
          <DialogDescription>
            {updates.length === 1
              ? "One update since your last visit."
              : `${updates.length} updates since your last visit.`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 space-y-4 overflow-y-auto">
          {updates.map((u) => (
            <div key={u.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{u.title}</h3>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{u.body}</p>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={dismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
