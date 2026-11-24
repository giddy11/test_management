// Superadmin-only: cross-org overview, with each organisation's plan. The
// "Manage plan" button (subscription.manage) records offline payments and
// changes plans by hand. There's no Organization
// entity — each row is a group of users sharing an organizationId, named
// after the org owner's company name (best effort, see useOrganizations).
import { useEffect, useState } from "react"
import { Building2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InlineLoader } from "@/components/shared/PageLoader"
import { useOrganizations } from "@/hooks/useOrganizations"
import { useDebounce } from "@/hooks/useDebounce"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"
import { planStatusText } from "@/lib/planStatus"
import { cn } from "@/lib/utils"
import { PlanBadge } from "@/components/subscription/PlanBadge"
import { OrganizationPlanDialog } from "@/components/subscription/OrganizationPlanDialog"
import type { OrganizationSummary } from "@/types/organization.types"

export default function OrganizationsPage() {
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)
  const [managing, setManaging] = useState<OrganizationSummary | null>(null)
  const { user } = useAuth()
  const canManagePlans = can(user?.permissions, "subscription.manage")

  useEffect(() => setPage(1), [debouncedSearch])

  const { data, isLoading, isError, error } = useOrganizations({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
  })

  const organizations = data?.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organisations</h1>
        <p className="text-sm text-muted-foreground">
          Every company using ServiceDesk4u, across all accounts.
        </p>
      </div>

      <Input
        placeholder="Search by company, owner name, or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Created</TableHead>
              {canManagePlans && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={canManagePlans ? 7 : 6} className="h-24">
                  <InlineLoader />
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={canManagePlans ? 7 : 6} className="h-24 text-center text-destructive">
                  {error instanceof Error ? error.message : "Failed to load organisations"}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && organizations.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManagePlans ? 7 : 6} className="h-24 text-center text-muted-foreground">
                  No organisations yet.
                </TableCell>
              </TableRow>
            )}
            {organizations.map((org) => (
              <TableRow key={org.organizationId}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    {org.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div>{org.ownerName}</div>
                  <div className="text-xs">{org.ownerEmail}</div>
                </TableCell>
                <TableCell className="text-right">{org.userCount}</TableCell>
                <TableCell className="text-right">{org.projectCount}</TableCell>
                <TableCell data-cy="org-plan">
                  {org.plan && (
                    <>
                      {org.plan.status === "none" ? (
                        <span className="text-xs font-medium whitespace-nowrap text-destructive">No subscription</span>
                      ) : (
                        <PlanBadge planKey={org.plan.planKey} name={org.plan.planName} />
                      )}
                      {org.plan.status !== "none" && (
                        <div
                          className={cn(
                            "mt-1 text-xs whitespace-nowrap",
                            org.plan.blocked ? "font-medium text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {planStatusText(org.plan)}
                        </div>
                      )}
                      {org.plan.extraSeats > 0 && (
                        <div className="text-xs whitespace-nowrap text-muted-foreground" data-cy="org-extra-seats">
                          +{org.plan.extraSeats} extra seat{org.plan.extraSeats === 1 ? "" : "s"}
                        </div>
                      )}
                    </>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(org.createdAt).toLocaleDateString()}
                </TableCell>
                {canManagePlans && (
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setManaging(org)} data-cy="manage-plan">
                      Manage plan
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {managing && <OrganizationPlanDialog organization={managing} onClose={() => setManaging(null)} />}

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data.meta.hasPrev}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!data.meta.hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
