// Superadmin-only: publish "what's new" announcements. Company admins see
// each announcement once, in the WhatsNewDialog modal, on their next visit.
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Megaphone } from "lucide-react"
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

const LIST_KEY = ["app-updates", "all"]

export default function AnnouncementsPage() {
  const qc = useQueryClient()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")

  const { data: updates = [], isLoading } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const res = await wrapCall<AppUpdate[]>("GET", "/api/v1/app-updates")
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
  })

  const publish = useMutation({
    mutationFn: async () => {
      const res = await wrapCall<AppUpdate>("POST", "/api/v1/app-updates", { title, body })
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => {
      toast.success("Published — admins will see it on their next visit")
      setTitle("")
      setBody("")
      qc.invalidateQueries({ queryKey: LIST_KEY })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to publish"),
  })

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
            <Megaphone className="size-4 text-primary" /> Publish an announcement
          </CardTitle>
          <CardDescription>Keep it short — a title and a few lines of what changed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              publish.mutate()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title"
                required
                maxLength={200}
                placeholder="New: public feedback forms for your projects"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ann-body">What changed</Label>
              <Textarea
                id="ann-body"
                required
                maxLength={5000}
                rows={5}
                placeholder={"- Projects now have a shareable public feedback form\n- Team leads can manage everything inside their project\n- Bug fixes and performance improvements"}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <div>
              <Button type="submit" disabled={publish.isPending || !title.trim() || !body.trim()}>
                {publish.isPending ? "Publishing…" : "Publish"}
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
