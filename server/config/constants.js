// config/constants.js
// Shared enum values mirrored across entities, schemas, and DTOs.

const UserRole = Object.freeze({
  SUPERADMIN: "superadmin", // the developer/platform owner
  ADMIN: "admin", // the company admin who registered the account
  USER: "user", // a member added by the company admin
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

const NotificationType = Object.freeze({
  PROJECT_MEMBER_ADDED: "project_member_added",
  FEEDBACK_NEW: "feedback_new",
  FEEDBACK_ASSIGNED: "feedback_assigned",
  FEEDBACK_CONFIRMED: "feedback_confirmed",
  TEST_ASSIGNED: "test_assigned",
  RUN_COMPLETED: "run_completed",
  FEATURE_REQUEST_STATUS_CHANGED: "feature_request_status_changed",
  FEATURE_REQUEST_COMMENT: "feature_request_comment",
  FEATURE_REQUEST_NEW: "feature_request_new",
  BUG_REPORTED: "bug_reported",
  BUG_ASSIGNED: "bug_assigned",
  BUG_STATUS_CHANGED: "bug_status_changed",
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
  TestCasePriority,
  TestCaseStatus,
  RunStatus,
  ResultStatus,
  AuthProvider,
  OtpType,
  NotificationType,
  FeatureRequestStatus,
  BugSeverity,
  BugPriority,
  BugStatus,
  enums: {
    userRole: Object.values(UserRole),
    projectMemberRole: Object.values(ProjectMemberRole),
    feedbackType: Object.values(FeedbackType),
    feedbackStatus: Object.values(FeedbackStatus),
    testCasePriority: Object.values(TestCasePriority),
    testCaseStatus: Object.values(TestCaseStatus),
    runStatus: Object.values(RunStatus),
    resultStatus: Object.values(ResultStatus),
    authProvider: Object.values(AuthProvider),
    otpType: Object.values(OtpType),
    notificationType: Object.values(NotificationType),
    featureRequestStatus: Object.values(FeatureRequestStatus),
    bugSeverity: Object.values(BugSeverity),
    bugPriority: Object.values(BugPriority),
    bugStatus: Object.values(BugStatus),
  },
};
