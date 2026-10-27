// components/serviceDesk/setup/LineManagersTab.tsx — who reports to whom,
// for the "line manager" approval rule. The manager is the one of the person
// a request is FOR (or, for a new starter, of the person asking).
import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spinner } from "@/components/shared/Spinner"
import { PersonCombobox } from "@/components/serviceDesk/PersonCombobox"
import { useManagers, useServiceDeskSettings, useSetManager, useUpdateApprovalRules } from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"

export function LineManagersTab() {
  const { data: people = [], isLoading } = useManagers()
  const setManager = useSetManager()
  const [search, setSearch] = useState("")
  const { data: settings } = useServiceDeskSettings()
  const setRules = useUpdateApprovalRules()
  const required = settings?.requireLineManager ?? true
  // The row being saved shows its new choice straight away, with a spinner.
  const saving = setManager.isPending ? setManager.variables : undefined

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase()
    return t ? people.filter((p) => `${p.name} ${p.email} ${p.managerName ?? ""}`.toLowerCase().includes(t)) : people
  }, [people, search])
  const missing = people.filter((p) => !p.managerId).length

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="py-4">
          <label className="flex items-start gap-3">
            <Checkbox
              className="mt-0.5"
              checked={required}
              disabled={!settings || setRules.isPending}
              onCheckedChange={(v) =>
                setRules.mutate(
                  { requireLineManager: v === true },
                  {
                    onSuccess: () => toast.success(v === true ? "A line manager is now required" : "A line manager is no longer required"),
                    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save"),
                  }
                )
              }
              data-cy="require-line-manager"
            />
            <span className="text-sm">
              <span className="font-medium">Require a line manager to submit</span>
              <span className="block text-muted-foreground">
                Someone with no line manager can&apos;t submit a request that needs one until it&apos;s set. Off: an IT request
                administrator approves in their place.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Used by policies with a "line manager" step.{" "}
          {missing > 0 &&
            `${missing} ${missing === 1 ? "person has" : "people have"} no manager. ${
              required
                ? "They can't submit requests that need their line manager's approval until one is set."
                : "Their line-manager steps go to IT request administrators."
            }`}
        </p>
        <div className="relative w-full sm:w-60">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 w-full pl-8" placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="w-72">Line manager</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => {
                  const pending = saving?.userId === p.id
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.email}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PersonCombobox
                            people={people.filter((m) => m.id !== p.id)}
                            value={pending ? saving.managerId : p.managerId}
                            noneLabel="No manager"
                            disabled={pending}
                            aria-label={`Line manager of ${p.name}`}
                            onChange={(managerId) => {
                              if (managerId === p.managerId) return
                              setManager.mutate(
                                { userId: p.id, managerId },
                                {
                                  onSuccess: () => toast.success("Line manager saved"),
                                  onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save"),
                                }
                              )
                            }}
                          />
                          {/* A fixed-size slot, so the dropdown doesn't shift when the spinner appears. */}
                          <span className="flex size-4 shrink-0 items-center justify-center" role="status" aria-label={pending ? "Saving" : undefined}>
                            {pending && <Spinner />}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
