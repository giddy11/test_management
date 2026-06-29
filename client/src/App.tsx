import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import LoginPage from "@/pages/auth/LoginPage"
import RegisterPage from "@/pages/auth/RegisterPage"
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

          {/* Authenticated */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
            </Route>
          </Route>

          {/* Admin + superadmin */}
          <Route element={<ProtectedRoute roles={[UserRole.SUPERADMIN, UserRole.ADMIN]} />}>
            <Route element={<DashboardLayout />}>
              <Route path="/team" element={<TeamPage />} />
            </Route>
          </Route>

          {/* Superadmin only */}
          <Route element={<ProtectedRoute roles={[UserRole.SUPERADMIN]} />}>
            <Route element={<DashboardLayout />}>
              <Route path="/platform" element={<PlaceholderPage title="Organisations" />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
