// modules/access/entities/role.entity.js
// A named bundle of permissions. Roles are per-organisation so one customer's
// custom roles are invisible to another; the single locked super-administrator
// role is the exception and carries organization_id = NULL.
const { EntitySchema } = require("typeorm");

const Role = new EntitySchema({
  name: "Role",
  tableName: "roles",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    // NULL = platform-level (the super administrator role only).
    organizationId: {
      name: "organization_id",
      type: "uuid",
      nullable: true,
    },
    // Stable seed identity for built-in roles, e.g. 'qa_engineer'. Null on
    // custom roles — they are identified by id and matched by name.
    key: {
      type: "varchar",
      length: 60,
      nullable: true,
    },
    name: {
      type: "varchar",
      length: 80,
    },
    description: {
      type: "text",
      nullable: true,
    },
    // Built-in: the name is fixed and the role cannot be deleted, but an admin
    // may still change which permissions it holds.
    isBuiltin: {
      name: "is_builtin",
      type: "boolean",
      default: false,
    },
    // Locked: cannot be edited, renamed, deleted, or have its permissions
    // changed — by anyone, through any route. Only the super role sets this.
    isLocked: {
      name: "is_locked",
      type: "boolean",
      default: false,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    updatedAt: {
      name: "updated_at",
      type: "timestamptz",
      updateDate: true,
    },
  },
  indices: [
    { name: "idx_roles_organization_id", columns: ["organizationId"] },
    // A built-in role is seeded at most once per organisation. Partial so the
    // many custom roles (key IS NULL) don't collide with each other.
    {
      name: "idx_roles_org_key",
      columns: ["organizationId", "key"],
      unique: true,
      where: `"key" IS NOT NULL AND "organization_id" IS NOT NULL`,
    },
    // Postgres treats NULLs as distinct in a unique index, so the index above
    // would happily accept two platform-level super roles. This one covers them.
    {
      name: "idx_roles_platform_key",
      columns: ["key"],
      unique: true,
      where: `"key" IS NOT NULL AND "organization_id" IS NULL`,
    },
  ],
});

module.exports = { Role };
