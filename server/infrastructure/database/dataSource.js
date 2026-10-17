// infrastructure/database/dataSource.js
// Single TypeORM DataSource. Every entity is registered here.
require("reflect-metadata");
const { DataSource } = require("typeorm");
const { env } = require("../../config/env");

const { User } = require("../../modules/auth/entities/user.entity");
const { RefreshToken } = require("../../modules/auth/entities/refreshToken.entity");
const { OtpCode } = require("../../modules/auth/entities/otpCode.entity");
const { Project } = require("../../modules/project/entities/project.entity");
const {
  ProjectMember,
} = require("../../modules/project/entities/projectMember.entity");
const { TestSuite } = require("../../modules/testSuite/entities/testSuite.entity");
const { TestCase } = require("../../modules/testCase/entities/testCase.entity");
const {
  TestCaseAttachment,
} = require("../../modules/testCase/entities/testCaseAttachment.entity");
const { TestCaseNote } = require("../../modules/testCase/entities/testCaseNote.entity");
const { TestRun } = require("../../modules/testRun/entities/testRun.entity");
const {
  TestRunResult,
} = require("../../modules/testRunResult/entities/testRunResult.entity");
const {
  Notification,
} = require("../../modules/notification/entities/notification.entity");
const {
  ActivityLog,
} = require("../../modules/activity/entities/activityLog.entity");
const {
  FeatureRequest,
} = require("../../modules/featureRequest/entities/featureRequest.entity");
const {
  FeatureRequestVote,
} = require("../../modules/featureRequest/entities/featureRequestVote.entity");
const {
  FeatureRequestAttachment,
} = require("../../modules/featureRequest/entities/featureRequestAttachment.entity");
const { Bug } = require("../../modules/bug/entities/bug.entity");
const {
  BugStatusHistory,
} = require("../../modules/bug/entities/bugStatusHistory.entity");
const {
  FeatureRequestStatusHistory,
} = require("../../modules/featureRequest/entities/featureRequestStatusHistory.entity");
const { AppUpdate } = require("../../modules/appUpdate/entities/appUpdate.entity");
const { Feedback } = require("../../modules/feedback/entities/feedback.entity");
const {
  FeedbackAttachment,
} = require("../../modules/feedback/entities/feedbackAttachment.entity");
const {
  FeedbackStatusHistory,
} = require("../../modules/feedback/entities/feedbackStatusHistory.entity");
const {
  FeedbackSupportStatusHistory,
} = require("../../modules/feedback/entities/feedbackSupportStatusHistory.entity");
const {
  FeedbackLookupCode,
} = require("../../modules/feedback/entities/feedbackLookupCode.entity");
const { BugAttachment } = require("../../modules/bug/entities/bugAttachment.entity");
const { SiteBanner } = require("../../modules/siteBanner/entities/siteBanner.entity");
const {
  ClientCompany,
} = require("../../modules/clientCompany/entities/clientCompany.entity");
const {
  SupportChatConversation,
} = require("../../modules/supportChat/entities/supportChatConversation.entity");
const {
  SupportChatSettings,
} = require("../../modules/supportChat/entities/supportChatSettings.entity");
const {
  LiveChatVisitor,
} = require("../../modules/liveChat/entities/liveChatVisitor.entity");
const {
  LiveChatConversation,
} = require("../../modules/liveChat/entities/liveChatConversation.entity");
const {
  LiveChatSettings,
} = require("../../modules/liveChat/entities/liveChatSettings.entity");
const {
  LiveChatAccount,
} = require("../../modules/liveChat/entities/liveChatAccount.entity");
const { SlaSettings } = require("../../modules/sla/entities/slaSettings.entity");
const { Permission } = require("../../modules/access/entities/permission.entity");
const {
  PermissionCategory,
} = require("../../modules/access/entities/permissionCategory.entity");
const { Role } = require("../../modules/access/entities/role.entity");
const {
  RolePermission,
} = require("../../modules/access/entities/rolePermission.entity");
const {
  UserRoleAssignment,
} = require("../../modules/access/entities/userRole.entity");

const { TicketLink } = require("../../modules/ticketLink/entities/ticketLink.entity");
const { AiCredential } = require("../../modules/ai/entities/aiCredential.entity");
const { AiUsageLog } = require("../../modules/ai/entities/aiUsageLog.entity");
const { AiCreditAccount } = require("../../modules/ai/entities/aiCreditAccount.entity");
const { AiCreditTransaction } = require("../../modules/ai/entities/aiCreditTransaction.entity");
const { AiSettings } = require("../../modules/ai/entities/aiSettings.entity");
const { ServiceDeskSettings } = require("../../modules/serviceDesk/entities/serviceDeskSettings.entity");
const { ServiceCatalogCategory } = require("../../modules/serviceDesk/entities/serviceCatalogCategory.entity");
const { ServiceCatalogItem } = require("../../modules/serviceDesk/entities/serviceCatalogItem.entity");
const { ServiceRequest } = require("../../modules/serviceDesk/entities/serviceRequest.entity");
const { ServiceRequestApproval } = require("../../modules/serviceDesk/entities/serviceRequestApproval.entity");
const {
  ServiceRequestStatusHistory,
} = require("../../modules/serviceDesk/entities/serviceRequestStatusHistory.entity");
const { ServiceRequestComment } = require("../../modules/serviceDesk/entities/serviceRequestComment.entity");
const { ServiceRequestAttachment } = require("../../modules/serviceDesk/entities/serviceRequestAttachment.entity");
const { ServiceApproverGroup } = require("../../modules/serviceDesk/entities/serviceApproverGroup.entity");
const {
  ServiceApproverGroupMember,
} = require("../../modules/serviceDesk/entities/serviceApproverGroupMember.entity");
const { ServiceApprovalPolicy } = require("../../modules/serviceDesk/entities/serviceApprovalPolicy.entity");
const {
  ServiceApprovalDelegation,
} = require("../../modules/serviceDesk/entities/serviceApprovalDelegation.entity");
const { ServiceRequestEscalation } = require("../../modules/serviceDesk/entities/serviceRequestEscalation.entity");
const { ServiceWebhookEndpoint } = require("../../modules/serviceDesk/entities/serviceWebhookEndpoint.entity");
const { ServiceAutomationRule } = require("../../modules/serviceDesk/entities/serviceAutomationRule.entity");
const { ServiceAutomationRun } = require("../../modules/serviceDesk/entities/serviceAutomationRun.entity");

const AppDataSource = new DataSource({
  type: "postgres",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  schema: env.db.schema, // optional override; defaults to public
  synchronize: env.db.synchronize, // dev only — use migrations in production
  logging: env.db.logging,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
  poolSize: env.db.poolSize,
  entities: [
    User,
    RefreshToken,
    OtpCode,
    Project,
    ProjectMember,
    TestSuite,
    TestCase,
    TestCaseAttachment,
    TestCaseNote,
    TestRun,
    TestRunResult,
    Notification,
    ActivityLog,
    FeatureRequest,
    FeatureRequestVote,
    FeatureRequestAttachment,
    Bug,
    BugAttachment,
    BugStatusHistory,
    FeatureRequestStatusHistory,
    AppUpdate,
    Feedback,
    FeedbackAttachment,
    FeedbackStatusHistory,
    FeedbackSupportStatusHistory,
    FeedbackLookupCode,
    SiteBanner,
    ClientCompany,
    SupportChatConversation,
    SupportChatSettings,
    LiveChatVisitor,
    LiveChatConversation,
    LiveChatSettings,
    LiveChatAccount,
    SlaSettings,
    Permission,
    PermissionCategory,
    Role,
    RolePermission,
    UserRoleAssignment,
    TicketLink,
    AiCredential,
    AiUsageLog,
    AiCreditAccount,
    AiCreditTransaction,
    AiSettings,
    ServiceDeskSettings,
    ServiceCatalogCategory,
    ServiceCatalogItem,
    ServiceRequest,
    ServiceRequestApproval,
    ServiceRequestStatusHistory,
    ServiceRequestComment,
    ServiceRequestAttachment,
    ServiceApproverGroup,
    ServiceApproverGroupMember,
    ServiceApprovalPolicy,
    ServiceApprovalDelegation,
    ServiceRequestEscalation,
    ServiceWebhookEndpoint,
    ServiceAutomationRule,
    ServiceAutomationRun,
  ],
  migrations: ["infrastructure/database/migrations/*.{js,ts}"],
});

module.exports = { AppDataSource };
