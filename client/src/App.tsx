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
import ActivityPage from "@/pages/ActivityPage"
import ProjectsPage from "@/pages/projects/ProjectsPage"
import ProjectDetailPage from "@/pages/projects/ProjectDetailPage"
import SuiteDetailPage from "@/pages/projects/SuiteDetailPage"
import TestCaseDetailPage from "@/pages/projects/TestCaseDetailPage"
import RunDetailPage from "@/pages/projects/RunDetailPage"
import FeatureRequestDetailPage from "@/pages/featureRequests/FeatureRequestDetailPage"
import BugDetailPage from "@/pages/bugs/BugDetailPage"
import PlaceholderPage from "@/pages/PlaceholderPage"
import SettingsPage from "@/pages/SettingsPage"
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
                <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                <Route path="/projects/:projectId/suites/:suiteId" element={<SuiteDetailPage />} />
                <Route path="/projects/:projectId/suites/:suiteId/cases/:caseId" element={<TestCaseDetailPage />} />
                <Route path="/projects/:projectId/runs/:runId" element={<RunDetailPage />} />
                <Route path="/projects/:projectId/feature-requests/:id" element={<FeatureRequestDetailPage />} />
                <Route path="/projects/:projectId/bugs/:id" element={<BugDetailPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={[UserRole.SUPERADMIN, UserRole.ADMIN]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/activity" element={<ActivityPage />} />
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
