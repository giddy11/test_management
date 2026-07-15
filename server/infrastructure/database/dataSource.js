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
  entities: [
    User,
    RefreshToken,
    OtpCode,
    Project,
    ProjectMember,
    TestSuite,
    TestCase,
    TestCaseAttachment,
    TestRun,
    TestRunResult,
    Notification,
    ActivityLog,
    FeatureRequest,
    FeatureRequestVote,
    FeatureRequestAttachment,
    Bug,
    BugAttachment,
    AppUpdate,
    Feedback,
    FeedbackAttachment,
    FeedbackStatusHistory,
    FeedbackSupportStatusHistory,
    SiteBanner,
    ClientCompany,
    SupportChatConversation,
    SupportChatSettings,
  ],
  migrations: ["infrastructure/database/migrations/*.{js,ts}"],
});

module.exports = { AppDataSource };
