// modules/activity/entities/activityLog.entity.js
// Org-scoped audit trail. One row per meaningful domain event.
const { EntitySchema } = require("typeorm");

const ActivityLog = new EntitySchema({
  name: "ActivityLog",
  tableName: "activity_logs",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    organizationId: {
      name: "organization_id",
      type: "uuid",
      nullable: true,
    },
    actorId: {
      name: "actor_id",
      type: "uuid",
      nullable: true,
    },
    // Set when the event belongs to a client company's IT support tier —
    // scopes what an it_support actor is allowed to see in their activity log.
    clientCompanyId: {
      name: "client_company_id",
      type: "uuid",
      nullable: true,
    },
    action: {
      type: "varchar",
      length: 60, // e.g. project.created, test_case.assigned
    },
    entityType: {
      name: "entity_type",
      type: "varchar",
      length: 40,
      nullable: true,
    },
    entityId: {
      name: "entity_id",
      type: "uuid",
      nullable: true,
    },
    summary: {
      type: "text",
    },
    metadata: {
      type: "jsonb",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  relations: {
    actor: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "actor_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    { name: "idx_activity_org_created", columns: ["organizationId", "createdAt"] },
    { name: "idx_activity_company_created", columns: ["clientCompanyId", "createdAt"] },
  ],
});

module.exports = { ActivityLog };
