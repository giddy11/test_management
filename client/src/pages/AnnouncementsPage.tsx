// Superadmin-only: publish "what's new" announcements. Company admins see
// each announcement once, in the WhatsNewDialog modal, on their next visit.
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Megaphone, Plus, Radio, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { AudiencePicker, type BroadcastAudience } from "@/components/announcements/AudiencePicker"
import { wrapCall, ApiError } from "@/transport/http"
import { SiteBannerEndpoints } from "@/endpoints/siteBanner.endpoints"
import { SITE_BANNER_KEY } from "@/hooks/useSiteBanner"
import { useUsers } from "@/hooks/useUsers"
import type { SiteBanner } from "@/types/siteBanner.types"

function recipientsLabel(ids: string[], usersById: Map<string, string>): string {
  if (ids.length === 0) return "0 people"
  const names = ids.map((id) => usersById.get(id) ?? "Unknown user")
  if (names.length <= 3) return names.join(", ")
  return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`
}

interface AppUpdate {
  id: string
  title: string
  body: string
  audience: BroadcastAudience
  recipientIds: string[] | null
  createdAt: string
}

function audienceLabel(u: AppUpdate, usersById: Map<string, string>): string {
  if (u.audience === "all") return "All users"
  if (u.audience === "custom") return recipientsLabel(u.recipientIds ?? [], usersById)
  return "All admins"
}

const EMPTY_BANNER: SiteBanner = { message: null, isActive: false, expiresAt: null }

const DURATION_OPTIONS = [
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "6 hours", minutes: 360 },
  { label: "12 hours", minutes: 720 },
  { label: "1 day", minutes: 1440 },
  { label: "3 days", minutes: 4320 },
  { label: "7 days", minutes: 10080 },
]

function bannerAudienceLabel(banner: SiteBanner, usersById: Map<string, string>): string {
  if (!banner.audience || banner.audience === "all") return "All users"
  if (banner.audience === "custom") return recipientsLabel(banner.recipientIds ?? [], usersById)
  return "All admins"
}

function SiteBannerCard() {
  const qc = useQueryClient()
  const [message, setMessage] = useState("")
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [audience, setAudience] = useState<BroadcastAudience>("all")
  const [recipientIds, setRecipientIds] = useState<Set<string>>(new Set())

  const { data: banner = EMPTY_BANNER } = useQuery({
    queryKey: SITE_BANNER_KEY,
    queryFn: async () => {
      const res = await SiteBannerEndpoints.fetchCurrent()
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? EMPTY_BANNER
    },
  })

  const { data: usersData } = useUsers({ limit: 100 })
  const usersById = new Map((usersData?.data ?? []).map((u) => [u.id, u.name]))

  const toggleRecipient = (userId: string) =>
    setRecipientIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })

  const activate = useMutation({
    mutationFn: async () => {
      const res = await SiteBannerEndpoints.activate({
        message: message.trim(),
        durationMinutes,
        audience,
        recipientIds: audience === "custom" ? Array.from(recipientIds) : undefined,
      })
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: (data) => {
      qc.setQueryData(SITE_BANNER_KEY, data)
      toast.success("Banner is live")
      setMessage("")
      setAudience("all")
      setRecipientIds(new Set())
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to activate banner"),
  })

  const deactivate = useMutation({
    mutationFn: async () => {
      const res = await SiteBannerEndpoints.deactivate()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: (data) => {
      qc.setQueryData(SITE_BANNER_KEY, data)
      toast.success("Banner turned off")
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to turn off banner"),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="size-4 text-primary" /> Site-wide banner
        </CardTitle>
        <CardDescription>
          A scrolling banner shown to every signed-in user, on every page, until you turn it off
          or its duration runs out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {banner.isActive ? (
          <div className="grid gap-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">{banner.message}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{bannerAudienceLabel(banner, usersById)}</Badge>
              {banner.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Live until {new Date(banner.expiresAt).toLocaleString()}
                </p>
              )}
            </div>
            <div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => deactivate.mutate()}
                disabled={deactivate.isPending}
                data-cy="banner-off"
              >
                {deactivate.isPending ? "Turning off…" : "Turn off"}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              activate.mutate()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="banner-message">Message</Label>
              <Textarea
                id="banner-message"
                rows={3}
                maxLength={500}
                placeholder="Scheduled maintenance tonight at 10pm — expect brief downtime."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Show for</Label>
              <Select
                value={String(durationMinutes)}
                onValueChange={(v) => setDurationMinutes(Number(v))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((o) => (
                    <SelectItem key={o.minutes} value={String(o.minutes)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AudiencePicker
              idPrefix="banner"
              audience={audience}
              recipientIds={recipientIds}
              onAudienceChange={setAudience}
              onToggleRecipient={toggleRecipient}
            />
            <div>
              <Button
                type="submit"
                disabled={
                  activate.isPending ||
                  !message.trim() ||
                  (audience === "custom" && recipientIds.size === 0)
                }
                data-cy="banner-on"
              >
                {activate.isPending ? "Turning on…" : "Turn on"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

interface DraftUpdate {
  key: number
  title: string
  body: string
  audience: BroadcastAudience
  recipientIds: Set<string>
}

const LIST_KEY = ["app-updates", "all"]

let nextDraftKey = 1
const emptyDraft = (): DraftUpdate => ({
  key: nextDraftKey++,
  title: "",
  body: "",
  audience: "admins",
  recipientIds: new Set(),
})

export default function AnnouncementsPage() {
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<DraftUpdate[]>([emptyDraft()])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const { data: updates = [], isLoading } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const res = await wrapCall<AppUpdate[]>("GET", "/api/v1/app-updates")
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
  })

  const { data: usersData } = useUsers({ limit: 100 })
  const usersById = new Map((usersData?.data ?? []).map((u) => [u.id, u.name]))

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = updates.length > 0 && selectedIds.size === updates.length
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(updates.map((u) => u.id)))

  const deleteSelected = useMutation({
    mutationFn: async () => {
      const res = await wrapCall<null>("DELETE", "/api/v1/app-updates/bulk", {
        ids: Array.from(selectedIds),
      })
      if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
    },
    onSuccess: () => {
      toast.success(
        selectedIds.size > 1 ? `Deleted ${selectedIds.size} updates` : "Update deleted"
      )
      setSelectedIds(new Set())
      setConfirmDeleteOpen(false)
      qc.invalidateQueries({ queryKey: LIST_KEY })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete"),
  })

  // Complete drafts (both fields filled, and a non-empty recipient list when
  // targeting specific users) are what actually gets published — a trailing
  // blank row the admin never got to doesn't block the rest.
  const completeDrafts = drafts.filter(
    (d) => d.title.trim() && d.body.trim() && (d.audience !== "custom" || d.recipientIds.size > 0)
  )

  const publishAll = useMutation({
    mutationFn: async () => {
      const items = completeDrafts.map((d) => ({
        title: d.title.trim(),
        body: d.body.trim(),
        audience: d.audience,
        recipientIds: d.audience === "custom" ? Array.from(d.recipientIds) : undefined,
      }))
      const res = await wrapCall<AppUpdate[]>("POST", "/api/v1/app-updates/bulk", { items })
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: (published) => {
      toast.success(
        published.length > 1
          ? `Published ${published.length} updates`
          : "Published — recipients will see it on their next visit"
      )
      setDrafts([emptyDraft()])
      qc.invalidateQueries({ queryKey: LIST_KEY })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to publish"),
  })

  const updateDraft = (key: number, patch: Partial<DraftUpdate>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))

  const toggleDraftRecipient = (key: number, userId: string) =>
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.key !== key) return d
        const next = new Set(d.recipientIds)
        if (next.has(userId)) next.delete(userId)
        else next.add(userId)
        return { ...d, recipientIds: next }
      })
    )

  const removeDraft = (key: number) =>
    setDrafts((prev) => (prev.length > 1 ? prev.filter((d) => d.key !== key) : prev))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Publish an update for all users, all admins, or a hand-picked list of people — each
          recipient sees it once, in a modal, the next time they open TestMate.
        </p>
      </div>

      <SiteBannerCard />

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
                    placeholder="New: public ticket forms for your projects"
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
                    placeholder={"- Projects now have a shareable public ticket form\n- Team leads can manage everything inside their project\n- Bug fixes and performance improvements"}
                    value={draft.body}
                    onChange={(e) => updateDraft(draft.key, { body: e.target.value })}
                  />
                </div>
                <AudiencePicker
                  idPrefix={`ann-${draft.key}`}
                  audience={draft.audience}
                  recipientIds={draft.recipientIds}
                  onAudienceChange={(audience) => updateDraft(draft.key, { audience })}
                  onToggleRecipient={(userId) => toggleDraftRecipient(draft.key, userId)}
                />
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
              <Button type="submit" disabled={publishAll.isPending || completeDrafts.length === 0} data-cy="publish-updates">
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Published ({updates.length})
          </h2>
          <div className="flex items-center gap-2">
            {updates.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={toggleSelectAll}>
                {allSelected ? "Deselect all" : "Select all"}
              </Button>
            )}
            {selectedIds.size > 0 && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="size-3.5" /> Delete selected ({selectedIds.size})
              </Button>
            )}
          </div>
        </div>
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
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="mt-1"
                    checked={selectedIds.has(u.id)}
                    onCheckedChange={() => toggleSelected(u.id)}
                    aria-label={`Select ${u.title}`}
                  />
                  <CardTitle className="text-base">{u.title}</CardTitle>
                  <Badge variant="outline" className="shrink-0">
                    {audienceLabel(u, usersById)}
                  </Badge>
                </div>
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

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete published updates"
        description={
          selectedIds.size > 1
            ? `This will permanently remove ${selectedIds.size} announcements. This cannot be undone.`
            : "This will permanently remove this announcement. This cannot be undone."
        }
        confirmLabel="Delete"
        loading={deleteSelected.isPending}
        onConfirm={() => deleteSelected.mutate()}
      />
    </div>
  )
}
