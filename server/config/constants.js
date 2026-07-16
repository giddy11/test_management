// config/constants.js
// Shared enum values mirrored across entities, schemas, and DTOs.

const UserRole = Object.freeze({
  SUPERADMIN: "superadmin", // the developer/platform owner
  ADMIN: "admin", // the company admin who registered the account
  USER: "user", // a member added by the company admin
  // External IT supporter belonging to a client company that uses one of the
  // org's products. Sees only their company's feedback queue (/support) —
  // locked out of projects, dashboards, and triage.
  IT_SUPPORT: "it_support",
});

// Role a user holds inside a single project (distinct from their app-wide UserRole).
// team_lead sees every suite/case in the project; member only sees what they're assigned.
const ProjectMemberRole = Object.freeze({
  MEMBER: "member",
  TEAM_LEAD: "team_lead",
});

const TestCasePriority = Object.freeze({
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
});

const TestCaseStatus = Object.freeze({
  DRAFT: "Draft",
  ACTIVE: "Active",
  DEPRECATED: "Deprecated",
});

const RunStatus = Object.freeze({
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
});

const ResultStatus = Object.freeze({
  PASS: "pass",
  FAIL: "fail",
  BLOCKED: "blocked",
  SKIPPED: "skipped",
});

const AuthProvider = Object.freeze({
  LOCAL: "local",
  GOOGLE: "google",
});

const OtpType = Object.freeze({
  VERIFY_EMAIL: "verify_email",
  RESET_PASSWORD: "reset_password",
});

// External feedback submitted through a project's public form.
const FeedbackType = Object.freeze({
  FEATURE_REQUEST: "feature_request",
  BUG: "bug",
  COMPLAINT: "complaint",
});

// How a feedback/ticket item was created — the public browser form, or a
// partner's server-to-server integration (see modules/feedback/routes/integrationFeedback.routes.ts).
const FeedbackSource = Object.freeze({
  PUBLIC_FORM: "public_form",
  INTEGRATION: "integration",
});

// Lifecycle of external feedback — the submitter is emailed at every stage.
const FeedbackStatus = Object.freeze({
  LOGGED: "logged",
  ACKNOWLEDGED: "acknowledged",
  ASSIGNED: "assigned",
  INVESTIGATING: "investigating",
  RESOLVED: "resolved",
  AWAITING_CONFIRMATION: "awaiting_confirmation",
  CLOSED: "closed",
});

// Lifecycle of a feedback item within a client company's IT support queue —
// the end user is emailed at every stage change, mirroring the product flow.
// Null on direct (project-token) submissions. Strictly ordered progression
// logged → acknowledged → investigating, then one of two terminal outcomes:
// resolved (fixed locally) or escalated (handed to the product team — the only
// state visible to the product owner's triage).
const SupportStatus = Object.freeze({
  LOGGED: "logged",
  ACKNOWLEDGED: "acknowledged",
  INVESTIGATING: "investigating",
  RESOLVED: "resolved",
  ESCALATED: "escalated",
});

// Set by IT support when they escalate an item — tells the product team how
// urgent it is. Null until escalated; never set on direct submissions.
const FeedbackSeverity = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
});

const NotificationType = Object.freeze({
  PROJECT_MEMBER_ADDED: "project_member_added",
  FEEDBACK_NEW: "feedback_new",
  FEEDBACK_ASSIGNED: "feedback_assigned",
  FEEDBACK_CONFIRMED: "feedback_confirmed",
  // The product team closed an item the IT supporter escalated — tells them
  // to relay the fix to their end user.
  FEEDBACK_CLOSED_SUPPORTER: "feedback_closed_supporter",
  TEST_ASSIGNED: "test_assigned",
  RUN_COMPLETED: "run_completed",
  FEATURE_REQUEST_STATUS_CHANGED: "feature_request_status_changed",
  FEATURE_REQUEST_COMMENT: "feature_request_comment",
  FEATURE_REQUEST_NEW: "feature_request_new",
  BUG_REPORTED: "bug_reported",
  BUG_ASSIGNED: "bug_assigned",
  BUG_STATUS_CHANGED: "bug_status_changed",
  // In-app support chat: a user messaged the super admins, or a super admin replied.
  SUPPORT_CHAT_MESSAGE: "support_chat_message",
  SUPPORT_CHAT_REPLY: "support_chat_reply",
});

// Lifecycle of an in-app support-chat conversation.
const SupportChatStatus = Object.freeze({
  OPEN: "open",
  CLOSED: "closed",
});

const FeatureRequestStatus = Object.freeze({
  NEW: "new",
  UNDER_REVIEW: "under_review",
  PLANNED: "planned",
  IN_PROGRESS: "in_progress",
  DONE: "done",
  REJECTED: "rejected",
});

const BugSeverity = Object.freeze({
  TRIVIAL: "Trivial",
  MINOR: "Minor",
  MAJOR: "Major",
  CRITICAL: "Critical",
});

const BugPriority = Object.freeze({
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
});

const BugStatus = Object.freeze({
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  FIXED: "Fixed",
  VERIFIED: "Verified",
  CLOSED: "Closed",
  REOPENED: "Reopened",
});

module.exports = {
  UserRole,
  ProjectMemberRole,
  FeedbackType,
  FeedbackStatus,
  FeedbackSource,
  SupportStatus,
  FeedbackSeverity,
  TestCasePriority,
  TestCaseStatus,
  RunStatus,
  ResultStatus,
  AuthProvider,
  OtpType,
  NotificationType,
  SupportChatStatus,
  FeatureRequestStatus,
  BugSeverity,
  BugPriority,
  BugStatus,
  enums: {
    userRole: Object.values(UserRole),
    projectMemberRole: Object.values(ProjectMemberRole),
    feedbackType: Object.values(FeedbackType),
    feedbackStatus: Object.values(FeedbackStatus),
    feedbackSource: Object.values(FeedbackSource),
    supportStatus: Object.values(SupportStatus),
    feedbackSeverity: Object.values(FeedbackSeverity),
    testCasePriority: Object.values(TestCasePriority),
    testCaseStatus: Object.values(TestCaseStatus),
    runStatus: Object.values(RunStatus),
    resultStatus: Object.values(ResultStatus),
    authProvider: Object.values(AuthProvider),
    otpType: Object.values(OtpType),
    notificationType: Object.values(NotificationType),
    supportChatStatus: Object.values(SupportChatStatus),
    featureRequestStatus: Object.values(FeatureRequestStatus),
    bugSeverity: Object.values(BugSeverity),
    bugPriority: Object.values(BugPriority),
    bugStatus: Object.values(BugStatus),
  },
};
