// modules/access/entities/userRole.entity.js
// Which roles a user holds. A user's effective permissions are the union of
// every row here, resolved per request (never baked into the access token —
// a role edit has to take effect immediately).
const { EntitySchema } = require("typeorm");

const UserRoleAssignment = new EntitySchema({
  name: "UserRoleAssignment",
  tableName: "user_roles",
  columns: {
    userId: {
      name: "user_id",
      type: "uuid",
      primary: true,
    },
    roleId: {
      name: "role_id",
      type: "uuid",
      primary: true,
    },
    // Who granted it — the audit log carries the detail, this is the quick answer.
    grantedBy: {
      name: "granted_by",
      type: "uuid",
      nullable: true,
    },
    grantedAt: {
      name: "granted_at",
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
    role: {
      type: "many-to-one",
      target: "Role",
      joinColumn: { name: "role_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "idx_user_roles_role", columns: ["roleId"] }],
});

module.exports = { UserRoleAssignment };
