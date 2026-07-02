import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Pencil, Trash2, Layers, ChevronRight, ClipboardList } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { SuiteFormDialog } from "@/components/testmgmt/SuiteFormDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { InlineLoader } from "@/components/shared/PageLoader"
import { useSuites, useDeleteSuite } from "@/hooks/useSuites"
import type { SuiteBreakdown, TestSuite } from "@/types/testMgmt.types"

export function SuitesTab({
  projectId,
  canManage,
  breakdown,
}: {
  projectId: string
  canManage: boolean
  breakdown?: Map<string, SuiteBreakdown>
}) {
  const navigate = useNavigate()
  const { data: suites = [], isLoading } = useSuites(projectId)
  const del = useDeleteSuite()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TestSuite | null>(null)
  const [deleting, setDeleting] = useState<TestSuite | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && (
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }} data-tour="new-suite-btn">
            <Plus className="mr-1 size-4" /> New suite
          </Button>
        )}
      </div>

      {isLoading && <InlineLoader className="py-8" />}
      {!isLoading && suites.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Layers className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No test suites yet.</p>
            {canManage && <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>Create a suite</Button>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suites.map((s) => (
          <Card
            key={s.id}
            className="group cursor-pointer transition-colors hover:border-primary/50"
            onClick={() => navigate(`/projects/${projectId}/suites/${s.id}`)}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{s.name}</CardTitle>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <CardDescription className="line-clamp-2">{s.description || "No description"}</CardDescription>
              <div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                <ClipboardList className="size-3" />
                {s.caseCount === 0
                  ? <span className="text-amber-600">No test cases yet</span>
                  : <span>{s.caseCount} test case{s.caseCount === 1 ? "" : "s"}</span>}
              </div>
              {(() => {
                const bd = breakdown?.get(s.id)
                if (!bd) return null
                const total = bd.pass + bd.fail + bd.blocked + bd.skipped + bd.pending
                if (total === 0) return null
                return (
                  <div className="pt-2">
                    <SummaryBar summary={{ total, pass: bd.pass, fail: bd.fail, blocked: bd.blocked, skipped: bd.skipped, pending: bd.pending }} />
                  </div>
                )
              })()}
            </CardHeader>
            {canManage && (
              <CardContent className="flex justify-end gap-1 pt-0">
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(s); setFormOpen(true) }}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleting(s) }}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <SuiteFormDialog open={formOpen} onOpenChange={setFormOpen} projectId={projectId} editing={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete suite"
        description={`"${deleting?.name ?? "This suite"}" and its test cases will be removed.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
            onSuccess: () => { toast.success("Suite deleted"); setDeleting(null) },
          })
        }
      />
    </div>
  )
}
