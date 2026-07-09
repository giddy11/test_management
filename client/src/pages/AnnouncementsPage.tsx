// Superadmin-only: publish "what's new" announcements. Company admins see
// each announcement once, in the WhatsNewDialog modal, on their next visit.
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Megaphone, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { wrapCall, ApiError } from "@/transport/http"

interface AppUpdate {
  id: string
  title: string
  body: string
  createdAt: string
}

interface DraftUpdate {
  key: number
  title: string
  body: string
}

const LIST_KEY = ["app-updates", "all"]

let nextDraftKey = 1
const emptyDraft = (): DraftUpdate => ({ key: nextDraftKey++, title: "", body: "" })

export default function AnnouncementsPage() {
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<DraftUpdate[]>([emptyDraft()])

  const { data: updates = [], isLoading } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const res = await wrapCall<AppUpdate[]>("GET", "/api/v1/app-updates")
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
  })

  // Complete drafts (both fields filled) are what actually gets published —
  // a trailing blank row the admin never got to doesn't block the rest.
  const completeDrafts = drafts.filter((d) => d.title.trim() && d.body.trim())

  const publishAll = useMutation({
    mutationFn: async () => {
      const items = completeDrafts.map((d) => ({ title: d.title.trim(), body: d.body.trim() }))
      const res = await wrapCall<AppUpdate[]>("POST", "/api/v1/app-updates/bulk", { items })
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: (published) => {
      toast.success(
        published.length > 1
          ? `Published ${published.length} updates — admins will see them on their next visit`
          : "Published — admins will see it on their next visit"
      )
      setDrafts([emptyDraft()])
      qc.invalidateQueries({ queryKey: LIST_KEY })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to publish"),
  })

  const updateDraft = (key: number, patch: Partial<DraftUpdate>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))

  const removeDraft = (key: number) =>
    setDrafts((prev) => (prev.length > 1 ? prev.filter((d) => d.key !== key) : prev))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Tell company admins what's new — each admin sees unseen announcements once, in a
          modal, the next time they open TestMate.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-4 text-primary" /> Publish updates
          </CardTitle>
          <CardDescription>
            Add one update per change. Drafting several? Add as many as you need, then publish
            them all at once — each still shows up as its own announcement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              publishAll.mutate()
            }}
          >
            {drafts.map((draft, i) => (
              <div key={draft.key} className="grid gap-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Update {i + 1}
                  </span>
                  {drafts.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => removeDraft(draft.key)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`ann-title-${draft.key}`}>Title</Label>
                  <Input
                    id={`ann-title-${draft.key}`}
                    maxLength={200}
                    placeholder="New: public feedback forms for your projects"
                    value={draft.title}
                    onChange={(e) => updateDraft(draft.key, { title: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`ann-body-${draft.key}`}>What changed</Label>
                  <Textarea
                    id={`ann-body-${draft.key}`}
                    maxLength={5000}
                    rows={5}
                    placeholder={"- Projects now have a shareable public feedback form\n- Team leads can manage everything inside their project\n- Bug fixes and performance improvements"}
                    value={draft.body}
                    onChange={(e) => updateDraft(draft.key, { body: e.target.value })}
                  />
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDrafts((prev) => [...prev, emptyDraft()])}
              >
                <Plus className="size-3.5" /> Add another update
              </Button>
              <Button type="submit" disabled={publishAll.isPending || completeDrafts.length === 0}>
                {publishAll.isPending
                  ? "Publishing…"
                  : completeDrafts.length > 1
                  ? `Publish all (${completeDrafts.length})`
                  : "Publish"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Published ({updates.length})
        </h2>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && updates.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nothing published yet.
            </CardContent>
          </Card>
        )}
        {updates.map((u) => (
          <Card key={u.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{u.title}</CardTitle>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(u.createdAt).toLocaleString()}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{u.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
