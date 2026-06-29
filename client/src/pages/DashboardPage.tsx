import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/contexts/AuthContext"
import { ROLE_LABEL } from "@/components/layout/nav"
import { UserRole } from "@/types/auth.types"

export default function DashboardPage() {
  const { user } = useAuth()
  if (!user) return null

  const roleBlurb: Record<string, string> = {
    [UserRole.SUPERADMIN]: "You manage every organisation on the platform.",
    [UserRole.ADMIN]: "You manage your company's projects, suites and team.",
    [UserRole.USER]: "You can run tests and record results for your team.",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">{roleBlurb[user.role]}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Your role</CardDescription>
            <CardTitle className="text-xl">{ROLE_LABEL[user.role]}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {user.email}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Organisation</CardDescription>
            <CardTitle className="text-xl">{user.companyName ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Email {user.isEmailVerified ? "verified" : "not verified"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Projects</CardDescription>
            <CardTitle className="text-xl">0</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Create your first project to get started.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
