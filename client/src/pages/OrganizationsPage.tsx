// Superadmin-only: read-only cross-org overview. There's no Organization
// entity — each row is a group of users sharing an organizationId, named
// after the org owner's company name (best effort, see useOrganizations).
import { useState } from "react"
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

export default function OrganizationsPage() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, error } = useOrganizations({
    page,
    limit: 20,
    search: search || undefined,
  })

  const organizations = data?.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organisations</h1>
        <p className="text-sm text-muted-foreground">
          Every company using TestMate, across all accounts.
        </p>
      </div>

      <Input
        placeholder="Search by company, owner name, or email…"
        value={search}
        onChange={(e) => {
          setPage(1)
          setSearch(e.target.value)
        }}
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
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="h-24">
                  <InlineLoader />
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-destructive">
                  {error instanceof Error ? error.message : "Failed to load organisations"}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && organizations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
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
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(org.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
