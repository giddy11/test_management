// modules/featureRequest/entities/featureRequest.entity.js
// Project-scoped — access is governed by ProjectService.assertAccess via the
// project relation, same as TestSuite.
const { EntitySchema } = require("typeorm");
const { enums, FeatureRequestStatus } = require("../../../config/constants");

const FeatureRequest = new EntitySchema({
  name: "FeatureRequest",
  tableName: "feature_requests",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    projectId: {
      name: "project_id",
      type: "uuid",
    },
    title: {
      type: "varchar",
      length: 200,
    },
    description: {
      type: "text",
    },
    status: {
      type: "enum",
      enum: enums.featureRequestStatus,
      default: FeatureRequestStatus.NEW,
    },
    category: {
      type: "varchar",
      length: 50,
      nullable: true,
    },
    // Optional free-text module/area of the project the request relates to
    // (e.g. "Billing", "Onboarding") — helps admins route it.
    module: {
      type: "varchar",
      length: 100,
      nullable: true,
    },
    // Optional external URLs the submitter adds for context (design mockups, similar
    // tools, docs, etc.) — same array-column pattern as TestCase.tags.
    referenceLinks: {
      name: "reference_links",
      type: "text",
      array: true,
      nullable: true,
    },
    submittedById: {
      name: "submitted_by_id",
      type: "uuid",
      nullable: true,
    },
    upvoteCount: {
      name: "upvote_count",
      type: "integer",
      default: 0,
    },
    // Denormalized — comments live in Firestore (realtime), not Postgres.
    commentCount: {
      name: "comment_count",
      type: "integer",
      default: 0,
    },
    adminResponse: {
      name: "admin_response",
      type: "text",
      nullable: true,
    },
    statusUpdatedAt: {
      name: "status_updated_at",
      type: "timestamptz",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    deletedAt: {
      name: "deleted_at",
      type: "timestamptz",
      deleteDate: true,
      nullable: true,
    },
  },
  relations: {
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      onDelete: "CASCADE",
    },
    submittedBy: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "submitted_by_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    { name: "idx_feature_requests_project_status_created", columns: ["projectId", "status", "createdAt"] },
    { name: "idx_feature_requests_submitted_by", columns: ["submittedById"] },
    { name: "idx_feature_requests_project_upvote_count", columns: ["projectId", "upvoteCount"] },
  ],
});

module.exports = { FeatureRequest };
