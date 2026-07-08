import { useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { ChevronLeft, Crown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SuitesTab } from "@/components/testmgmt/SuitesTab"
import { RunsTab } from "@/components/testmgmt/RunsTab"
import { FeatureRequestsTab } from "@/components/featureRequests/FeatureRequestsTab"
import { BugsTab } from "@/components/bugs/BugsTab"
import { useProject } from "@/hooks/useProjects"
import { useDashboard } from "@/hooks/useDashboard"
import { useAuth } from "@/contexts/AuthContext"
import { PageLoader } from "@/components/shared/PageLoader"
import { UserRole } from "@/types/auth.types"
import type { SuiteBreakdown } from "@/types/testMgmt.types"

export default function ProjectDetailPage() {
  const { projectId = "" } = useParams()
  const { user } = useAuth()
  const { data: project, isLoading } = useProject(projectId)
  // Admins always manage; a regular user manages when they lead this project.
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN
  const canManage =
    isAdmin ||
    Boolean(project?.members?.some((m) => m.id === user?.id && m.role === "team_lead"))
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
        {Boolean(project?.members?.length) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {project!.members!.map((m) => (
              <Badge key={m.id} variant="secondary" className="gap-1 text-xs font-normal">
                {m.role === "team_lead" && <Crown className="size-3 text-amber-500" />}
                {m.name}
                {m.role === "team_lead" && <span className="text-muted-foreground">· Lead</span>}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Tabs defaultValue="suites">
        <TabsList>
          <TabsTrigger value="suites">Test Suites</TabsTrigger>
          <TabsTrigger value="runs" data-tour="runs-tab-trigger">Test Runs</TabsTrigger>
          <TabsTrigger value="feature-requests">Feature Requests</TabsTrigger>
          <TabsTrigger value="bugs">Bug Fixes</TabsTrigger>
        </TabsList>
        <TabsContent value="suites" className="mt-4">
          <SuitesTab
            projectId={projectId}
            projectName={project?.name ?? ""}
            canManage={canManage}
            breakdown={breakdownMap}
          />
        </TabsContent>
        <TabsContent value="runs" className="mt-4">
          <RunsTab projectId={projectId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="feature-requests" className="mt-4">
          <FeatureRequestsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="bugs" className="mt-4">
          <BugsTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
