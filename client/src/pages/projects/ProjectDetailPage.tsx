import { Link, useParams } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SuitesTab } from "@/components/testmgmt/SuitesTab"
import { RunsTab } from "@/components/testmgmt/RunsTab"
import { useProject } from "@/hooks/useProjects"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"

export default function ProjectDetailPage() {
  const { projectId = "" } = useParams()
  const { user } = useAuth()
  const canManage = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN
  const { data: project, isLoading } = useProject(projectId)

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Projects
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLoading ? "Loading…" : project?.name}
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
          <SuitesTab projectId={projectId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="runs" className="mt-4">
          <RunsTab projectId={projectId} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
