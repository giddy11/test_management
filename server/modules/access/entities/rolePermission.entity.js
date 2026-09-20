// modules/access/entities/rolePermission.entity.js
// Which permissions a role grants. The wildcard '*' is stored here like any
// other code (see the permissions seed), so the resolver needs no special case
// at the query level — only at the membership test.
const { EntitySchema } = require("typeorm");

const RolePermission = new EntitySchema({
  name: "RolePermission",
  tableName: "role_permissions",
  columns: {
    roleId: {
      name: "role_id",
      type: "uuid",
      primary: true,
    },
    permissionCode: {
      name: "permission_code",
      type: "varchar",
      length: 64,
      primary: true,
    },
  },
  relations: {
    role: {
      type: "many-to-one",
      target: "Role",
      joinColumn: { name: "role_id" },
      onDelete: "CASCADE",
    },
    permission: {
      type: "many-to-one",
      target: "Permission",
      joinColumn: { name: "permission_code", referencedColumnName: "code" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "idx_role_permissions_code", columns: ["permissionCode"] }],
});

module.exports = { RolePermission };
