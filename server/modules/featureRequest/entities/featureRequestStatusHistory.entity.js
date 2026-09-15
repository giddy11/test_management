// modules/featureRequest/entities/featureRequestStatusHistory.entity.js
// One row per status a feature request has entered — timestamps power the
// SLA "paused time" calculation and a timeline, same idea as
// FeedbackStatusHistory.
const { EntitySchema } = require("typeorm");

const FeatureRequestStatusHistory = new EntitySchema({
  name: "FeatureRequestStatusHistory",
  tableName: "feature_request_status_history",
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
    status: {
      type: "varchar",
      length: 30,
    },
    // Not a `createDate` column — callers set this explicitly (the initial
    // "new" entry is backdated to the request's own createdAt).
    enteredAt: {
      name: "entered_at",
      type: "timestamptz",
      default: () => "CURRENT_TIMESTAMP",
    },
  },
  relations: {
    featureRequest: {
      type: "many-to-one",
      target: "FeatureRequest",
      joinColumn: { name: "feature_request_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [
    { name: "idx_feature_request_status_history_fr", columns: ["featureRequestId", "enteredAt"] },
  ],
});

module.exports = { FeatureRequestStatusHistory };
