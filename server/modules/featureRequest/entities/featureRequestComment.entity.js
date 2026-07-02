// modules/featureRequest/entities/featureRequestComment.entity.js
const { EntitySchema } = require("typeorm");

const FeatureRequestComment = new EntitySchema({
  name: "FeatureRequestComment",
  tableName: "feature_request_comments",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    featureRequestId: {
      name: "feature_request_id",
      type: "uuid",
    },
    authorId: {
      name: "author_id",
      type: "uuid",
      nullable: true,
    },
    body: {
      type: "text",
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
    featureRequest: {
      type: "many-to-one",
      target: "FeatureRequest",
      joinColumn: { name: "feature_request_id" },
      onDelete: "CASCADE",
    },
    author: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "author_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    { name: "idx_feature_request_comments_request_created", columns: ["featureRequestId", "createdAt"] },
  ],
});

module.exports = { FeatureRequestComment };
