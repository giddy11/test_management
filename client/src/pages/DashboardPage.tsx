import { Link, useSearchParams } from "react-router-dom"
import { FolderKanban, Layers, ClipboardList, FlaskConical, Trophy, ChevronRight, Lightbulb, Bug, LayoutDashboard, Gauge } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ResultDonut, DistributionBars } from "@/components/dashboard/AnalyticsCharts"
import { RecentRunsCard } from "@/components/dashboard/RecentRunsCard"
import { SlaDashboard } from "@/components/sla/SlaDashboard"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageLoader } from "@/components/shared/PageLoader"
import { OnboardingTour } from "@/components/onboarding/OnboardingTour"
import { useDashboard } from "@/hooks/useDashboard"
import { useAuth } from "@/contexts/AuthContext"
import type { LucideIcon } from "lucide-react"

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card data-cy={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
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

// Admin-only card: total + per-status counts for feature requests / bugs,
// broken down by project so it's clear where each one came from.
function StatusBreakdownCard({
  icon: Icon,
  title,
  description,
  breakdown,
}: {
  icon: LucideIcon
  title: string
  description: string
  breakdown: {
    total: number
    byProject: { projectId: string; projectName: string; total: number; byStatus: { key: string; count: number }[] }[]
  }
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Icon className="size-4 text-primary" />
        <div>
          <CardTitle className="text-base">
            {title} <span className="ml-1 text-muted-foreground">({breakdown.total})</span>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {breakdown.byProject.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing reported yet.</p>
        ) : (
          <div className="space-y-3">
            {breakdown.byProject.map((proj) => (
              <div key={proj.projectId}>
                <Link
                  to={`/projects/${proj.projectId}`}
                  className="text-sm font-medium hover:underline"
                >
                  {proj.projectName}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {proj.byStatus.map((s) => (
                    <Badge key={s.key} variant="secondary" className="gap-1 text-xs capitalize">
                      {s.key.replace(/_/g, " ")}
                      <span className="font-semibold">{s.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PassRateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 80 ? "bg-green-500/10 text-green-600" :
    rate >= 50 ? "bg-yellow-500/10 text-yellow-600" :
    "bg-red-500/10 text-red-600"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {rate}%
    </span>
  )
}

// The dashboard has two views: the test-management overview (default) and
// the SLA & support analytics. The active tab lives in the URL (?tab=sla) so
// it can be linked to directly.
type DashboardTab = "overview" | "sla"

export default function DashboardPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: DashboardTab = searchParams.get("tab") === "sla" ? "sla" : "overview"
  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === "sla") params.set("tab", "sla")
    else params.delete("tab")
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user?.firstName}</h1>
        <p className="text-sm text-muted-foreground">
          {tab === "sla"
            ? "Support ticket performance: response and resolution times, SLA compliance, and recurring issues."
            : user?.role === "user"
              ? "Your projects, assigned tests and results at a glance."
              : "Track how your documented tests are being followed up and executed."}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5" data-cy="dashboard-tab-overview">
            <LayoutDashboard className="size-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="sla" className="gap-1.5" data-cy="dashboard-tab-sla">
            <Gauge className="size-3.5" /> SLA &amp; support
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="sla" className="mt-4">
          {tab === "sla" && <SlaDashboard />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OverviewTab() {
  const { data, isLoading } = useDashboard()

  return (
    <div className="space-y-6">
      {isLoading && <PageLoader label="Loading analytics" />}

      {data && (
        <>
          <OnboardingTour />

          {/* Totals */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-tour="stat-cards">
            <StatCard icon={FolderKanban} label="Projects" value={data.totals.projects} />
            <StatCard icon={Layers} label="Test suites" value={data.totals.suites} />
            <StatCard icon={ClipboardList} label="Test cases" value={data.totals.cases} />
            <StatCard icon={FlaskConical} label="Test runs" value={data.totals.runs} />
          </div>

          {/* Analytics */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Execution summary</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">{data.passRate}%</span>
                  {" "}
                  <span className="text-xs">pass rate · {data.resultBreakdown.total} results total</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-3">
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

          {/* Projects → Suites → Cases breakdown */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Projects breakdown</CardTitle>
                <CardDescription>Test suites and cases per project</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data.projectsBreakdown.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-muted-foreground">No projects yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Suites</TableHead>
                        <TableHead className="text-right">Cases</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.projectsBreakdown.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{p.suiteCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{p.caseCount}</Badge>
                          </TableCell>
                          <TableCell>
                            <Link to={`/projects/${p.id}`}>
                              <ChevronRight className="size-4 text-muted-foreground hover:text-foreground" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Suites breakdown</CardTitle>
                <CardDescription>Test cases per suite</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data.suitesBreakdown.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-muted-foreground">No suites yet.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Suite</TableHead>
                          <TableHead className="text-right">Cases</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.suitesBreakdown.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{s.caseCount}</Badge>
                            </TableCell>
                            <TableCell>
                              <Link to={`/projects/${s.projectId}/suites/${s.id}`}>
                                <ChevronRight className="size-4 text-muted-foreground hover:text-foreground" />
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Feature requests + bugs oversight — present only for company admins */}
          {(data.featureRequests || data.bugs) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.featureRequests && (
                <StatusBreakdownCard
                  icon={Lightbulb}
                  title="Feature requests"
                  description="Across your organisation's projects"
                  breakdown={data.featureRequests}
                />
              )}
              {data.bugs && (
                <StatusBreakdownCard
                  icon={Bug}
                  title="Bug fixes"
                  description="Across your organisation's projects"
                  breakdown={data.bugs}
                />
              )}
            </div>
          )}

          {/* Top performers (admin-only) + Recent runs */}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.topPerformers && (
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Trophy className="size-4 text-yellow-500" />
                <div>
                  <CardTitle className="text-base">Top performers</CardTitle>
                  <CardDescription>Ranked by tests passed</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.topPerformers.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-muted-foreground">
                    No execution data yet. Results are recorded when testers mark cases pass/fail in a run.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Tester</TableHead>
                        <TableHead className="text-right">Executed</TableHead>
                        <TableHead className="text-right">Passed</TableHead>
                        <TableHead className="text-right">Pass rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topPerformers.map((p, i) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-muted-foreground font-medium">{i + 1}</TableCell>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.total}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.passes}</TableCell>
                          <TableCell className="text-right">
                            <PassRateBadge rate={p.passRate} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            )}

            <RecentRunsCard />
          </div>
        </>
      )}
    </div>
  )
}
