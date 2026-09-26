import { Link, useParams } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PriorityBadge, CaseStatusBadge } from "@/components/shared/StatusBadge"
import { AttachmentsSection } from "@/components/testmgmt/AttachmentsSection"
import { CaseNotesSection, RunNotesSection } from "@/components/testmgmt/CaseNotesSection"
import { PageLoader } from "@/components/shared/PageLoader"
import { useCase } from "@/hooks/useCases"
import { useCanManageProject } from "@/hooks/useProjects"
export default function TestCaseDetailPage() {
  const { projectId = "", suiteId = "", caseId = "" } = useParams()
  const canManageProject = useCanManageProject(projectId)
  const { data: tc, isLoading } = useCase(caseId)

  if (isLoading) return <PageLoader />
  if (!tc) return <p className="text-sm text-destructive">Test case not found.</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/projects/${projectId}/suites/${suiteId}`} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Back to suite
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{tc.title}</h1>
          <PriorityBadge value={tc.priority} />
          <CaseStatusBadge value={tc.status} />
        </div>
        {tc.description && <p className="mt-1 text-sm text-muted-foreground">{tc.description}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Steps</CardTitle></CardHeader>
          <CardContent>
            {tc.steps.length ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {tc.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No steps recorded.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Expected result</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{tc.expectedResult}</p>
            {tc.tags?.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="flex flex-wrap gap-1.5">
                  {tc.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Anyone who can view this case (assigned users included) can attach screenshots. */}
          <AttachmentsSection caseId={tc.id} canManage={true} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            {/* Same bar as attachments — anyone who can see the case can add a note. */}
            <CaseNotesSection caseId={tc.id} canModerate={canManageProject} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <RunNotesSection caseId={tc.id} projectId={projectId} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
