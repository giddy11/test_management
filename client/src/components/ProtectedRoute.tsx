// components/ProtectedRoute.tsx — gates routes by auth state and optional role.
import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { PageLoader } from "@/components/shared/PageLoader"
import { homePathForRole } from "@/components/layout/nav"
import type { UserRole } from "@/types/auth.types"

interface ProtectedRouteProps {
  roles?: UserRole[]
}

export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth()

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

  // Bounce to the role's own home — supporters must never loop back into
  // /dashboard, which they can't access.
  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />
  }

  return <Outlet />
}
