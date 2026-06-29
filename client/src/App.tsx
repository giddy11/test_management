import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { RequireVerified } from "@/components/RequireVerified"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import LoginPage from "@/pages/auth/LoginPage"
import RegisterPage from "@/pages/auth/RegisterPage"
import VerifyEmailPage from "@/pages/auth/VerifyEmailPage"
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage"
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage"
import DashboardPage from "@/pages/DashboardPage"
import TeamPage from "@/pages/team/TeamPage"
import ProjectsPage from "@/pages/projects/ProjectsPage"
import PlaceholderPage from "@/pages/PlaceholderPage"
import { UserRole } from "@/types/auth.types"

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Authenticated */}
          <Route element={<ProtectedRoute />}>
            {/* Reachable before verification */}
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* Everything below requires a verified email */}
            <Route element={<RequireVerified />}>
              <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
              </Route>

              <Route element={<ProtectedRoute roles={[UserRole.SUPERADMIN, UserRole.ADMIN]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/team" element={<TeamPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute roles={[UserRole.SUPERADMIN]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/platform" element={<PlaceholderPage title="Organisations" />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
