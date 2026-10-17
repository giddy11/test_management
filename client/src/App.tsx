import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { ScrollToTop } from "@/components/ScrollToTop"
import { RequireVerified } from "@/components/RequireVerified"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { PageLoader } from "@/components/shared/PageLoader"

// Each page is its own chunk, fetched the first time it is visited, so the
// first load only downloads the shell and the page in front of the user.
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"))
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"))
const VerifyEmailPage = lazy(() => import("@/pages/auth/VerifyEmailPage"))
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"))
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"))
const DashboardPage = lazy(() => import("@/pages/DashboardPage"))
const TeamPage = lazy(() => import("@/pages/team/TeamPage"))
const ActivityPage = lazy(() => import("@/pages/ActivityPage"))
const ProjectsPage = lazy(() => import("@/pages/projects/ProjectsPage"))
const ProjectDetailPage = lazy(() => import("@/pages/projects/ProjectDetailPage"))
const SuiteDetailPage = lazy(() => import("@/pages/projects/SuiteDetailPage"))
const TestCaseDetailPage = lazy(() => import("@/pages/projects/TestCaseDetailPage"))
const RunDetailPage = lazy(() => import("@/pages/projects/RunDetailPage"))
const FeatureRequestDetailPage = lazy(() => import("@/pages/featureRequests/FeatureRequestDetailPage"))
const BugDetailPage = lazy(() => import("@/pages/bugs/BugDetailPage"))
const OrganizationsPage = lazy(() => import("@/pages/OrganizationsPage"))
const SettingsPage = lazy(() => import("@/pages/SettingsPage"))
const WhatsAppWidgetPage = lazy(() => import("@/pages/widget/WhatsAppWidgetPage"))
const LandingPage = lazy(() => import("@/pages/public/LandingPage"))
const PrivacyPage = lazy(() => import("@/pages/public/PrivacyPage"))
const TermsPage = lazy(() => import("@/pages/public/TermsPage"))
const PublicFeedbackPage = lazy(() => import("@/pages/public/PublicFeedbackPage"))
const MyTicketsPage = lazy(() => import("@/pages/public/MyTicketsPage"))
const DocsPage = lazy(() => import("@/pages/docs/DocsPage"))
const AnnouncementsPage = lazy(() => import("@/pages/AnnouncementsPage"))
const AllFeedbackPage = lazy(() => import("@/pages/feedback/AllFeedbackPage"))
const SupportQueuePage = lazy(() => import("@/pages/support/SupportQueuePage"))
const SupportActivityPage = lazy(() => import("@/pages/support/SupportActivityPage"))
const SupportInboxPage = lazy(() => import("@/pages/support/SupportInboxPage"))
const RequestPortalPage = lazy(() => import("@/pages/serviceDesk/RequestPortalPage"))
const RequestFormPage = lazy(() => import("@/pages/serviceDesk/RequestFormPage"))
const RequestDetailPage = lazy(() => import("@/pages/serviceDesk/RequestDetailPage"))
const MyRequestsPage = lazy(() => import("@/pages/serviceDesk/MyRequestsPage"))
const ApprovalsPage = lazy(() => import("@/pages/serviceDesk/ApprovalsPage"))
const ServiceQueuePage = lazy(() => import("@/pages/serviceDesk/ServiceQueuePage"))
const CatalogSetupPage = lazy(() => import("@/pages/serviceDesk/CatalogSetupPage"))
const ServiceReportsPage = lazy(() => import("@/pages/serviceDesk/ServiceReportsPage"))
// Replaced by WhatsAppWidgetPage below (same route) — kept in case the full
// live-chat panel is wanted again; the component itself is untouched.
// const LiveChatWidgetPage = lazy(() => import("@/pages/widget/LiveChatWidgetPage"))

// Route groups are gated on permissions, not role names. Each list is "any one
// of these admits you" — the pages themselves hide the parts a viewer can not
// use, and the API re-checks everything regardless.
const INTERNAL_APP = ["dashboard.read", "project.read"]

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        {/* Public pages while their chunk loads. Pages inside DashboardLayout
            have their own boundary there, so the sidebar stays put. */}
        <Suspense fallback={<PageLoader />}>
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
            {/* Embeddable widget — always loaded inside an iframe on a
                third-party site by public/live-chat-widget.js, never visited directly */}
            {/* <Route path="/widget/live-chat/:token" element={<LiveChatWidgetPage />} /> */}
            <Route path="/widget/live-chat/:token" element={<WhatsAppWidgetPage />} />

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
                  </Route>
                </Route>

                {/* IT requests — a module of its own, separate from testing. Each
                    page also shows a notice while the organisation has it off. */}
                <Route element={<ProtectedRoute anyOf={["servicerequest.create"]} />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/requests" element={<RequestPortalPage />} />
                    <Route path="/requests/mine" element={<MyRequestsPage />} />
                    <Route path="/requests/new/:itemId" element={<RequestFormPage />} />
                    <Route path="/requests/:id/edit" element={<RequestFormPage />} />
                  </Route>
                </Route>
                <Route element={<ProtectedRoute anyOf={["servicerequest.create", "servicedesk.manage"]} />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/requests/approvals" element={<ApprovalsPage />} />
                  </Route>
                </Route>
                <Route element={<ProtectedRoute anyOf={["servicedesk.work"]} />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/requests/queue" element={<ServiceQueuePage />} />
                  </Route>
                </Route>
                <Route element={<ProtectedRoute anyOf={["servicedesk.manage"]} />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/requests/catalog" element={<CatalogSetupPage />} />
                  </Route>
                </Route>
                <Route element={<ProtectedRoute anyOf={["servicedesk.report"]} />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/requests/reports" element={<ServiceReportsPage />} />
                  </Route>
                </Route>
                <Route element={<ProtectedRoute anyOf={["servicerequest.create", "servicedesk.work", "servicedesk.manage"]} />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/requests/:id" element={<RequestDetailPage />} />
                  </Route>
                </Route>

                <Route element={<ProtectedRoute anyOf={["user.create", "audit.read"]} />}>
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
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
