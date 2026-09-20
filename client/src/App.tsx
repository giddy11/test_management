import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { ScrollToTop } from "@/components/ScrollToTop"
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
import OrganizationsPage from "@/pages/OrganizationsPage"
import SettingsPage from "@/pages/SettingsPage"
import LiveChatWidgetPage from "@/pages/widget/LiveChatWidgetPage"
import LandingPage from "@/pages/public/LandingPage"
import PrivacyPage from "@/pages/public/PrivacyPage"
import TermsPage from "@/pages/public/TermsPage"
import PublicFeedbackPage from "@/pages/public/PublicFeedbackPage"
import MyTicketsPage from "@/pages/public/MyTicketsPage"
import DocsPage from "@/pages/docs/DocsPage"
import AnnouncementsPage from "@/pages/AnnouncementsPage"
import AllFeedbackPage from "@/pages/feedback/AllFeedbackPage"
import SupportQueuePage from "@/pages/support/SupportQueuePage"
import SupportActivityPage from "@/pages/support/SupportActivityPage"
import SupportInboxPage from "@/pages/support/SupportInboxPage"
import SupportSlaPage from "@/pages/support/SupportSlaPage"
// Route groups are gated on permissions, not role names. Each list is "any one
// of these admits you" — the pages themselves hide the parts a viewer can not
// use, and the API re-checks everything regardless.
const INTERNAL_APP = ["dashboard.read", "project.read", "ticket.read"]

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <Routes>
          {/* Public */}
          {/* Marketing home — redirects signed-in users to their role's home */}
          <Route path="/" element={<LandingPage />} />
          {/* Legal — public, and reachable while signed in */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Public feedback form — no account needed, token-gated */}
          <Route path="/feedback/:token" element={<PublicFeedbackPage />} />
          {/* A submitter's own ticket history, no account (email + one-time code) */}
          <Route path="/my-tickets" element={<MyTicketsPage />} />
          {/* Public product documentation */}
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/doc" element={<Navigate to="/docs" replace />} />
          {/* Embeddable live-chat widget — always loaded inside an iframe on a
              third-party site by public/live-chat-widget.js, never visited directly */}
          <Route path="/widget/live-chat/:token" element={<LiveChatWidgetPage />} />

          {/* Authenticated */}
          <Route element={<ProtectedRoute />}>
            {/* Reachable before verification */}
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* Everything below requires a verified email */}
            <Route element={<RequireVerified />}>
              {/* Reachable by every authenticated role, including IT supporters */}
              <Route element={<DashboardLayout />}>
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              {/* Internal (product-org) roles only */}
              <Route element={<ProtectedRoute anyOf={INTERNAL_APP} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                  <Route path="/projects/:projectId/suites/:suiteId" element={<SuiteDetailPage />} />
                  <Route path="/projects/:projectId/suites/:suiteId/cases/:caseId" element={<TestCaseDetailPage />} />
                  <Route path="/projects/:projectId/runs/:runId" element={<RunDetailPage />} />
                  <Route path="/projects/:projectId/feature-requests/:id" element={<FeatureRequestDetailPage />} />
                  {/* Shareable permalink by reference code (e.g. "FR-014") instead of the uuid */}
                  <Route path="/projects/:projectId/feature-requests/ref/:code" element={<FeatureRequestDetailPage />} />
                  <Route path="/projects/:projectId/bugs/:id" element={<BugDetailPage />} />
                  <Route path="/projects/:projectId/bugs/ref/:code" element={<BugDetailPage />} />
                  <Route path="/all-feedback" element={<AllFeedbackPage />} />
                </Route>
              </Route>

              {/* IT support portal — external client-company supporters */}
              <Route element={<ProtectedRoute anyOf={["supportqueue.read"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/support" element={<SupportQueuePage />} />
                  <Route path="/support/activity" element={<SupportActivityPage />} />
                  <Route path="/support/sla" element={<SupportSlaPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute anyOf={["user.read", "audit.read"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/activity" element={<ActivityPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute anyOf={["platform.read", "announcement.manage", "supportchat.read"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/platform" element={<OrganizationsPage />} />
                <Route path="/announcements" element={<AnnouncementsPage />} />
                <Route path="/support-inbox" element={<SupportInboxPage />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
