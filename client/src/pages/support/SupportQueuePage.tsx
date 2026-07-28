// pages/support/SupportQueuePage.tsx — the IT supporter's home. Their client
// company's feedback queue: open items to triage, locally-resolved history,
// and escalated items with the product team's live stage.
import { useState } from "react"
import { Headset, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SupportItemDialog } from "@/components/support/SupportItemDialog"
import { SupportersDialog } from "@/components/feedback/SupportersDialog"
import { useSupportQueue, useSupportTeammates } from "@/hooks/useFeedback"
import { useMyClientCompany } from "@/hooks/useClientCompanies"
import { useAuth } from "@/contexts/AuthContext"
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  SUPPORT_PROGRESSION,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  type Feedback,
  type FeedbackType,
  type SupportStatus,
} from "@/types/feedback.types"

export default function SupportQueuePage() {
  const { user } = useAuth()
  const isLead = Boolean(user?.isSupportLead)
  const [tab, setTab] = useState<SupportStatus>("logged")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [assignedFilter, setAssignedFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<Feedback | null>(null)
  const [managingTeam, setManagingTeam] = useState(false)

  const { data: teammates = [] } = useSupportTeammates(isLead)
  const { data: myCompany } = useMyClientCompany(isLead && managingTeam)

  const { data, isLoading } = useSupportQueue({
    page,
    limit: 20,
    supportStatus: tab,
    type: typeFilter === "all" ? undefined : (typeFilter as FeedbackType),
    ...(assignedFilter === "unassigned"
      ? { unassigned: true }
      : assignedFilter === "mine"
        ? { assignedSupporterId: user?.id }
        : assignedFilter !== "all"
          ? { assignedSupporterId: assignedFilter }
          : {}),
  })

  const items = data?.data ?? []
  const meta = data?.meta

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Headset className="size-6 text-primary" /> Ticket queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Tickets from {user?.companyName ?? "your company"}'s users. Resolve what you can
            locally — escalate to the product team what you can't.
          </p>
        </div>
        {isLead && (
          <Button size="sm" variant="outline" onClick={() => setManagingTeam(true)}>
            <Users className="mr-1 size-3.5" /> Manage my team
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as SupportStatus); setPage(1) }}>
          <TabsList>
            {SUPPORT_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(FEEDBACK_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignedFilter} onValueChange={(v) => { setAssignedFilter(v); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="mine">Assigned to me</SelectItem>
            {isLead &&
              teammates
                .filter((t) => t.id !== user?.id)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading queue…</p>}
      {!isLoading && items.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {tab === "logged"
              ? "Nothing waiting — your queue is clear."
              : `No ${SUPPORT_STATUS_LABELS[tab].toLowerCase()} items yet.`}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((fb) => (
          <Card key={fb.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{fb.ticketCode}</span>
                <CardTitle className="text-base">{fb.title}</CardTitle>
                <Badge variant="outline">{FEEDBACK_TYPE_LABELS[fb.type]}</Badge>
                {fb.suiteName && (
                  <Badge variant="outline" className="text-muted-foreground">{fb.suiteName}</Badge>
                )}
                {fb.attachments.length > 0 && (
                  <Badge variant="secondary">{fb.attachments.length} 📎</Badge>
                )}
                {fb.assignedSupporterName && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Assigned: {fb.assignedSupporterName}
                  </Badge>
                )}
                {fb.supportStatus === "escalated" && (
                  <Badge variant="default">
                    Product team: {FEEDBACK_STATUS_LABELS[fb.status]}
                  </Badge>
                )}
              </div>
              <CardDescription>
                From {fb.submitterName} ({fb.submitterEmail}) ·{" "}
                {new Date(fb.createdAt).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-start justify-between gap-3 pt-0">
              <p className="line-clamp-2 text-sm text-muted-foreground">{fb.description}</p>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => setViewing(fb)}>
                {fb.supportStatus && SUPPORT_PROGRESSION.includes(fb.supportStatus) ? "Triage" : "View"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={!meta.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <SupportItemDialog feedback={viewing} onOpenChange={(o) => !o && setViewing(null)} />

      <SupportersDialog
        company={managingTeam ? myCompany ?? null : null}
        onOpenChange={(o) => !o && setManagingTeam(false)}
      />
    </div>
  )
}
