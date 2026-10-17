// pages/serviceDesk/MyRequestsPage.tsx — what I've asked IT for (and what
// colleagues asked for on my behalf), with drafts kept separately.
import { useState } from "react"
import { Link } from "react-router-dom"
import { ClipboardList, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RequestList } from "@/components/serviceDesk/RequestList"
import { ModuleOffNotice } from "@/components/serviceDesk/RequestBits"
import { useServiceDeskSettings, useServiceRequests } from "@/hooks/useServiceDesk"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"
import type { ListRequestsParams } from "@/types/serviceDesk.types"

type Tab = "open" | "draft" | "closed"

const FILTER: Record<Tab, Partial<ListRequestsParams>> = {
  open: { view: "open" },
  draft: { status: "draft" },
  closed: { view: "closed" },
}

const EMPTY: Record<Tab, string> = {
  open: "Nothing in progress. Anything you request shows up here.",
  draft: "No drafts.",
  closed: "Nothing finished yet.",
}

export default function MyRequestsPage() {
  const { permissions } = useAuth()
  const [tab, setTab] = useState<Tab>("open")
  const [page, setPage] = useState(1)
  const { data: settings, isLoading: loadingSettings } = useServiceDeskSettings()
  const enabled = Boolean(settings?.enabled)
  const { data, isLoading } = useServiceRequests({ scope: "mine", ...FILTER[tab], page, limit: 20 }, enabled)

  if (loadingSettings) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ClipboardList className="size-6 text-primary" /> My requests
          </h1>
          <p className="text-sm text-muted-foreground">Everything you've asked IT for, and anything requested on your behalf.</p>
        </div>
        {enabled && (
          <Button asChild size="sm">
            <Link to="/requests">
              <Plus className="mr-1 size-3.5" /> New request
            </Link>
          </Button>
        )}
      </div>

      {!enabled ? (
        <ModuleOffNotice canManage={can(permissions, "servicedesk.manage")} />
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setPage(1) }}>
            <TabsList>
              <TabsTrigger value="open">In progress</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>
          </Tabs>
          <RequestList
            requests={data?.data ?? []}
            isLoading={isLoading}
            emptyText={EMPTY[tab]}
            meta={data?.meta}
            onPage={setPage}
          />
        </>
      )}
    </div>
  )
}
