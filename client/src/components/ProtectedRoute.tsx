// components/ProtectedRoute.tsx — gates routes by auth state and permission.
//
// FOR USABILITY ONLY. A route that renders is not a route the user can get
// data from: every endpoint behind it re-checks on the server. This exists so
// people don't land on a page that would only show them errors.
import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { PageLoader } from "@/components/shared/PageLoader"
import { homePathFor } from "@/components/layout/nav"
import { canAny } from "@/lib/can"

interface ProtectedRouteProps {
  /** Any one of these permissions admits the user. Omitted = any signed-in user. */
  anyOf?: string[]
}

export function ProtectedRoute({ anyOf }: ProtectedRouteProps) {
  const { isLoading, isAuthenticated, permissions } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <PageLoader />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Bounce to whatever home this user does have — a supporter must never loop
  // back into /dashboard, which they can't open.
  if (anyOf && !canAny(permissions, anyOf)) {
    return <Navigate to={homePathFor(permissions)} replace />
  }

  return <Outlet />
}
