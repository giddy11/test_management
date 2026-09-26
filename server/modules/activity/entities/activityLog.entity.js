// modules/activity/entities/activityLog.entity.js
// Org-scoped audit trail. One row per meaningful domain event.
//
// APPEND-ONLY. There is no update or delete path for this table anywhere in the
// app, and the database enforces it with a trigger (see the HardenActivityLog
// migration) so a stray `save()` or a hand-written UPDATE cannot rewrite history.
// Everything the log needs to stay readable is denormalised at write time —
// actor_name and actor_role in particular — so an entry still reads correctly
// after the person who made it is renamed or removed.
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
    // Denormalised at write time. The row must keep reading correctly when the
    // actor is later renamed or deleted, which is exactly when an auditor needs
    // it most — so this is the name the UI shows, not the joined user's.
    actorName: {
      name: "actor_name",
      type: "varchar",
      length: 160,
      nullable: true,
    },
    actorRole: {
      name: "actor_role",
      type: "varchar",
      length: 40,
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
    // info | warning | critical — derived from the action by severity.catalog.js.
    severity: {
      type: "varchar",
      length: 10,
      default: "info",
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
    // Join only, no foreign key: an append-only table cannot accept the UPDATE
    // that ON DELETE SET NULL would issue. actor_name/actor_role carry the
    // display data, and this relation exists solely to hydrate the live user's
    // email for actors who are still around.
    actor: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "actor_id" },
      nullable: true,
      createForeignKeyConstraints: false,
    },
  },
  indices: [
    { name: "idx_activity_org_created", columns: ["organizationId", "createdAt"] },
    { name: "idx_activity_company_created", columns: ["clientCompanyId", "createdAt"] },
    // The two filter dropdowns. Both are leading-column-scoped by organisation
    // so they stay selective as the log grows past a single org's rows.
    { name: "idx_activity_org_severity_created", columns: ["organizationId", "severity", "createdAt"] },
    { name: "idx_activity_org_entity_created", columns: ["organizationId", "entityType", "createdAt"] },
  ],
});

module.exports = { ActivityLog };
