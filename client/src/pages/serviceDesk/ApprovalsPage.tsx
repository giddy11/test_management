// pages/serviceDesk/ApprovalsPage.tsx — requests waiting on my decision, and
// the ones I've already decided. You're here because a catalog item names
// you as an approver (or you set the catalog up), not because of a role.
import { useState } from "react"
import { ListChecks } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RequestList } from "@/components/serviceDesk/RequestList"
import { ModuleOffNotice } from "@/components/serviceDesk/RequestBits"
import { useMyApprovals, useServiceDeskSettings } from "@/hooks/useServiceDesk"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"

export default function ApprovalsPage() {
  const { permissions } = useAuth()
  const [state, setState] = useState<"pending" | "decided">("pending")
  const [page, setPage] = useState(1)
  const { data: settings, isLoading: loadingSettings } = useServiceDeskSettings()
  const { data, isLoading } = useMyApprovals(state, page, Boolean(settings?.enabled))

  if (loadingSettings) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ListChecks className="size-6 text-primary" /> Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          IT requests that need your yes or no before IT can start. Any one approver's decision counts.
        </p>
      </div>

      {!settings?.enabled ? (
        <ModuleOffNotice canManage={can(permissions, "servicedesk.manage")} />
      ) : (
        <>
          <Tabs value={state} onValueChange={(v) => { setState(v as "pending" | "decided"); setPage(1) }}>
            <TabsList>
              <TabsTrigger value="pending">Waiting for me</TabsTrigger>
              <TabsTrigger value="decided">Decided</TabsTrigger>
            </TabsList>
          </Tabs>
          <RequestList
            requests={data?.data ?? []}
            isLoading={isLoading}
            showRequester
            emptyText={state === "pending" ? "Nothing waiting for your approval." : "You haven't decided any requests yet."}
            meta={data?.meta}
            onPage={setPage}
          />
        </>
      )}
    </div>
  )
}
