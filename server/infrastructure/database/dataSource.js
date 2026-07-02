// infrastructure/database/dataSource.js
// Single TypeORM DataSource. Every entity is registered here.
require("reflect-metadata");
const { DataSource } = require("typeorm");
const { env } = require("../../config/env");

const { User } = require("../../modules/auth/entities/user.entity");
const { RefreshToken } = require("../../modules/auth/entities/refreshToken.entity");
const { OtpCode } = require("../../modules/auth/entities/otpCode.entity");
const { Project } = require("../../modules/project/entities/project.entity");
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
  ],
  migrations: ["infrastructure/database/migrations/*.js"],
});

module.exports = { AppDataSource };
