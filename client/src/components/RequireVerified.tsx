// components/RequireVerified.tsx — blocks the app until the email is verified.
import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"

export function RequireVerified() {
  const { user } = useAuth()
  if (user && !user.isEmailVerified) {
    return <Navigate to="/verify-email" replace />
  }
  return <Outlet />
}
