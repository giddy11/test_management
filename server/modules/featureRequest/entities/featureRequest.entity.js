// modules/featureRequest/entities/featureRequest.entity.js
// Platform-wide product feedback — visible to every user regardless of organisation.
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
    submittedById: {
      name: "submitted_by_id",
      type: "uuid",
      nullable: true,
    },
    // Captured for context only — never used to scope visibility (platform-wide board).
    organizationId: {
      name: "organization_id",
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
    submittedBy: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "submitted_by_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    { name: "idx_feature_requests_status_created", columns: ["status", "createdAt"] },
    { name: "idx_feature_requests_submitted_by", columns: ["submittedById"] },
    { name: "idx_feature_requests_upvote_count", columns: ["upvoteCount"] },
  ],
});

module.exports = { FeatureRequest };
