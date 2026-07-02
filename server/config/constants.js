// config/constants.js
// Shared enum values mirrored across entities, schemas, and DTOs.

const UserRole = Object.freeze({
  SUPERADMIN: "superadmin", // the developer/platform owner
  ADMIN: "admin", // the company admin who registered the account
  USER: "user", // a member added by the company admin
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

const NotificationType = Object.freeze({
  TEST_ASSIGNED: "test_assigned",
  RUN_COMPLETED: "run_completed",
  FEATURE_REQUEST_STATUS_CHANGED: "feature_request_status_changed",
  FEATURE_REQUEST_COMMENT: "feature_request_comment",
  FEATURE_REQUEST_NEW: "feature_request_new",
});

const FeatureRequestStatus = Object.freeze({
  NEW: "new",
  UNDER_REVIEW: "under_review",
  PLANNED: "planned",
  IN_PROGRESS: "in_progress",
  DONE: "done",
  REJECTED: "rejected",
});

module.exports = {
  UserRole,
  TestCasePriority,
  TestCaseStatus,
  RunStatus,
  ResultStatus,
  AuthProvider,
  OtpType,
  NotificationType,
  FeatureRequestStatus,
  enums: {
    userRole: Object.values(UserRole),
    testCasePriority: Object.values(TestCasePriority),
    testCaseStatus: Object.values(TestCaseStatus),
    runStatus: Object.values(RunStatus),
    resultStatus: Object.values(ResultStatus),
    authProvider: Object.values(AuthProvider),
    otpType: Object.values(OtpType),
    notificationType: Object.values(NotificationType),
    featureRequestStatus: Object.values(FeatureRequestStatus),
  },
};
