// modules/featureRequest/entities/featureRequestVote.entity.js
const { EntitySchema } = require("typeorm");

const FeatureRequestVote = new EntitySchema({
  name: "FeatureRequestVote",
  tableName: "feature_request_votes",
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
    userId: {
      name: "user_id",
      type: "uuid",
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  relations: {
    featureRequest: {
      type: "many-to-one",
      target: "FeatureRequest",
      joinColumn: { name: "feature_request_id" },
      onDelete: "CASCADE",
    },
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [
    {
      name: "idx_feature_request_votes_request_user",
      columns: ["featureRequestId", "userId"],
      unique: true,
    },
  ],
});

module.exports = { FeatureRequestVote };
