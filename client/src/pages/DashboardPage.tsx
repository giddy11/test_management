import { Link } from "react-router-dom"
import { FolderKanban, Layers, ClipboardList, FlaskConical } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ResultDonut, DistributionBars } from "@/components/dashboard/AnalyticsCharts"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { useDashboard } from "@/hooks/useDashboard"
import { useAuth } from "@/contexts/AuthContext"
import type { LucideIcon } from "lucide-react"

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading } = useDashboard()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user?.firstName}</h1>
        <p className="text-sm text-muted-foreground">
          Track how your documented tests are being followed up and executed.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading analytics…</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={FolderKanban} label="Projects" value={data.totals.projects} />
            <StatCard icon={Layers} label="Test suites" value={data.totals.suites} />
            <StatCard icon={ClipboardList} label="Test cases" value={data.totals.cases} />
            <StatCard icon={FlaskConical} label="Test runs" value={data.totals.runs} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-0">
                <CardDescription>Overall pass rate</CardDescription>
                <CardTitle className="text-3xl">{data.passRate}%</CardTitle>
              </CardHeader>
              <CardContent>
                <ResultDonut breakdown={data.resultBreakdown} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader><CardTitle className="text-base">Cases by status</CardTitle></CardHeader>
              <CardContent><DistributionBars data={data.caseStatus} /></CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader><CardTitle className="text-base">Cases by priority</CardTitle></CardHeader>
              <CardContent><DistributionBars data={data.casePriority} /></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent test runs</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {data.recentRuns.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No runs yet. Open a project and start a test run to begin tracking.
                </p>
              )}
              {data.recentRuns.map((run) => (
                <Link
                  key={run.id}
                  to={`/projects/${run.projectId}/runs/${run.id}`}
                  className="block rounded-lg border p-3 transition-colors hover:border-primary/50"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{run.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <SummaryBar summary={run.summary} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
