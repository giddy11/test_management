// modules/notification/entities/notification.entity.js
const { EntitySchema } = require("typeorm");
const { enums } = require("../../../config/constants");

const Notification = new EntitySchema({
  name: "Notification",
  tableName: "notifications",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    userId: {
      name: "user_id",
      type: "uuid",
    },
    type: {
      type: "enum",
      enum: enums.notificationType,
    },
    title: {
      type: "varchar",
      length: 255,
    },
    body: {
      type: "text",
      nullable: true,
    },
    // Extra payload for deep-linking (e.g. caseId, projectId, runId).
    data: {
      type: "jsonb",
      nullable: true,
    },
    readAt: {
      name: "read_at",
      type: "timestamptz",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [
    { name: "idx_notifications_user_created", columns: ["userId", "createdAt"] },
    { name: "idx_notifications_user_read", columns: ["userId", "readAt"] },
  ],
});

module.exports = { Notification };
