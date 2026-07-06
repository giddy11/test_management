import { useState } from "react"
import { Link } from "react-router-dom"
import { FolderKanban, Layers, User, Users, Filter, X } from "lucide-react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { useRecentRuns } from "@/hooks/useDashboard"
import { useProjects } from "@/hooks/useProjects"
import { useSuites } from "@/hooks/useSuites"

const PAGE_SIZE = 8

export function RecentRunsCard() {
  const [projectId, setProjectId] = useState("")
  const [suiteId, setSuiteId] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)

  const { data: projectsData } = useProjects({ page: 1, limit: 100 })
  const projects = projectsData?.data ?? []
  const { data: suites = [] } = useSuites(projectId)

  const { data, isLoading } = useRecentRuns({
    projectId: projectId || undefined,
    suiteId: suiteId || undefined,
    status: status || undefined,
    page,
    limit: PAGE_SIZE,
  })
  const runs = data?.data ?? []
  const meta = data?.meta

  const hasFilter = Boolean(projectId || suiteId || status)

  const onProjectChange = (v: string) => {
    setProjectId(v === "all" ? "" : v)
    setSuiteId("")
    setPage(1)
  }
  const onSuiteChange = (v: string) => {
    setSuiteId(v === "all" ? "" : v)
    setPage(1)
  }
  const onStatusChange = (v: string) => {
    setStatus(v === "all" ? "" : v)
    setPage(1)
  }
  const clearFilters = () => {
    setProjectId("")
    setSuiteId("")
    setStatus("")
    setPage(1)
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">Recent test runs</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <Select value={projectId || "all"} onValueChange={onProjectChange}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={suiteId || "all"} onValueChange={onSuiteChange} disabled={!projectId}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="All suites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suites</SelectItem>
              {suites.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status || "all"} onValueChange={onStatusChange}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          {hasFilter && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
              <X className="size-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
        {!isLoading && runs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {hasFilter
              ? "No runs match these filters."
              : "No runs yet. Open a project and start a test run to begin tracking."}
          </p>
        )}
        {runs.map((run) => (
          <Link
            key={run.id}
            to={`/projects/${run.projectId}/runs/${run.id}`}
            className="block rounded-lg border p-3 transition-colors hover:border-primary/50"
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={run.status === "completed" ? "default" : "secondary"}
                className="font-normal"
              >
                {run.status === "completed" ? "Completed" : "In progress"}
              </Badge>
              <Badge variant="outline" className="font-normal">
                <FolderKanban className="size-3" /> {run.projectName}
              </Badge>
              {run.suiteName && (
                <Badge variant="outline" className="font-normal">
                  <Layers className="size-3" /> {run.suiteName}
                </Badge>
              )}
            </div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{run.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(run.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="mb-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
              {run.createdByName && (
                <span className="flex items-center gap-1">
                  <User className="size-3 shrink-0" />
                  Started by <span className="font-medium text-foreground ml-0.5">{run.createdByName}</span>
                </span>
              )}
              {run.testers && run.testers.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="size-3 shrink-0" />
                  <span className="font-medium text-foreground">
                    {run.testers.slice(0, 2).join(", ")}
                    {run.testers.length > 2 && ` +${run.testers.length - 2} more`}
                  </span>
                </span>
              )}
            </div>
            <SummaryBar summary={run.summary} />
          </Link>
        ))}
      </CardContent>
      {(meta?.hasNext || page > 1) && (
        <CardFooter className="justify-between border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!meta?.hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
