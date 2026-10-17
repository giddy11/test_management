// components/serviceDesk/setup/LineManagersTab.tsx — who reports to whom,
// for the "line manager" approval rule. The manager is the one of the person
// a request is FOR (or, for a new starter, of the person asking).
import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useManagers, useSetManager } from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"

const NONE = "__none__"

export function LineManagersTab() {
  const { data: people = [], isLoading } = useManagers()
  const setManager = useSetManager()
  const [search, setSearch] = useState("")

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase()
    return t ? people.filter((p) => `${p.name} ${p.email} ${p.managerName ?? ""}`.toLowerCase().includes(t)) : people
  }, [people, search])
  const missing = people.filter((p) => !p.managerId).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Used by policies with a "line manager" step. {missing > 0 && `${missing} ${missing === 1 ? "person has" : "people have"} no manager — their line-manager steps go to IT request administrators.`}
        </p>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 w-60 pl-8" placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                {shown.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.email}</p>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={p.managerId ?? NONE}
                        onValueChange={(v) =>
                          setManager.mutate(
                            { userId: p.id, managerId: v === NONE ? null : v },
                            {
                              onSuccess: () => toast.success("Line manager saved"),
                              onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save"),
                            }
                          )
                        }
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>No manager</SelectItem>
                          {people
                            .filter((m) => m.id !== p.id)
                            .map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
