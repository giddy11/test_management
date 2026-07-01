import { useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SuitesTab } from "@/components/testmgmt/SuitesTab"
import { RunsTab } from "@/components/testmgmt/RunsTab"
import { useProject } from "@/hooks/useProjects"
import { useDashboard } from "@/hooks/useDashboard"
import { useAuth } from "@/contexts/AuthContext"
import { PageLoader } from "@/components/shared/PageLoader"
import { UserRole } from "@/types/auth.types"
import type { SuiteBreakdown } from "@/types/testMgmt.types"

export default function ProjectDetailPage() {
  const { projectId = "" } = useParams()
  const { user } = useAuth()
  const canManage = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN
  const { data: project, isLoading } = useProject(projectId)
  const { data: stats } = useDashboard(projectId)

  const breakdownMap = useMemo<Map<string, SuiteBreakdown>>(() => {
    if (!stats?.suitesBreakdown) return new Map()
    return new Map(stats.suitesBreakdown.map((b) => [b.id, b]))
  }, [stats?.suitesBreakdown])

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Projects
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {project?.name}
        </h1>
        {project?.description && (
          <p className="text-sm text-muted-foreground">{project.description}</p>
        )}
      </div>

      <Tabs defaultValue="suites">
        <TabsList>
          <TabsTrigger value="suites">Test Suites</TabsTrigger>
          <TabsTrigger value="runs">Test Runs</TabsTrigger>
        </TabsList>
        <TabsContent value="suites" className="mt-4">
          <SuitesTab projectId={projectId} canManage={canManage} breakdown={breakdownMap} />
        </TabsContent>
        <TabsContent value="runs" className="mt-4">
          <RunsTab projectId={projectId} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
