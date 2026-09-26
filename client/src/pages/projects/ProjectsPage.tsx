import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Pencil, Trash2, FolderKanban, ChevronRight, Layers } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog"
import { PageLoader } from "@/components/shared/PageLoader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useProjects, useDeleteProject } from "@/hooks/useProjects"
import { useDebounce } from "@/hooks/useDebounce"
import { useAuth } from "@/contexts/AuthContext"
import type { Project } from "@/types/project.types"

export default function ProjectsPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const canManage = can("project.manageall")
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)

  useEffect(() => setPage(1), [debouncedSearch])

  const { data, isLoading, isError, error } = useProjects({ page, limit: 12, search: debouncedSearch || undefined })
  const remove = useDeleteProject()

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const confirmDelete = () => {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      onSuccess: () => {
        toast.success("Project deleted")
        setDeleting(null)
      },
    })
  }

  const projects = data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Group your test suites and runs by project.</p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="w-full sm:w-auto" data-tour="new-project-btn" data-cy="new-project">
            <Plus className="mr-1 size-4" /> New project
          </Button>
        )}
      </div>

      <Input
        placeholder="Search projects…"
        data-cy="project-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {isLoading && <PageLoader />}
      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load projects"}
        </p>
      )}

      {!isLoading && !isError && projects.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FolderKanban className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No projects yet.</p>
            {canManage && <Button onClick={openCreate}>Create your first project</Button>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Card
            key={p.id}
            data-cy="project-card"
            className="group cursor-pointer transition-colors hover:border-primary/50"
            onClick={() => navigate(`/projects/${p.id}`)}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <CardDescription className="line-clamp-2">
                {p.description || "No description"}
              </CardDescription>
              <div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                <Layers className="size-3" />
                {p.suiteCount === 0
                  ? <span className="text-amber-600">No suites yet</span>
                  : <span>{p.suiteCount} suite{p.suiteCount === 1 ? "" : "s"}</span>}
              </div>
            </CardHeader>
            {canManage && (
              <CardContent className="flex justify-end gap-1 pt-0">
                <Button
                  variant="ghost"
                  size="sm"
                  data-cy="project-edit"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(p)
                    setFormOpen(true)
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-cy="project-delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleting(p)
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!data.meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <ProjectFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete project"
        description={`"${deleting?.name ?? "This project"}" and its suites will be removed.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
