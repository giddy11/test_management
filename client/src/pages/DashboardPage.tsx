import { Link } from "react-router-dom"
import { FolderKanban, Layers, ClipboardList, FlaskConical, Trophy, ChevronRight, User, Users } from "lucide-react"
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
import { SummaryBar } from "@/components/shared/SummaryBar"
import { PageLoader } from "@/components/shared/PageLoader"
import { OnboardingTour } from "@/components/onboarding/OnboardingTour"
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

          {/* Top performers + Recent runs */}
          <div className="grid gap-4 lg:grid-cols-2">
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
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
