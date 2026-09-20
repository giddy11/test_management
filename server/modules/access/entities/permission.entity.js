// modules/access/entities/permission.entity.js
// The catalog, mirrored into the database so role_permissions can reference it
// and the role editor can render categories without shipping the catalog twice.
// Code-owned: every column here is refreshed from permissions.catalog.js on seed.
const { EntitySchema } = require("typeorm");

const Permission = new EntitySchema({
  name: "Permission",
  tableName: "permissions",
  columns: {
    // 'result.amend' — the code IS the identity, so it is the primary key.
    code: {
      type: "varchar",
      length: 64,
      primary: true,
    },
    category: {
      type: "varchar",
      length: 40,
    },
    label: {
      type: "varchar",
      length: 120,
    },
    description: {
      type: "text",
      nullable: true,
    },
    // Amber note shown under the checkbox, e.g. "Can grant any permission".
    warning: {
      type: "text",
      nullable: true,
    },
    sortOrder: {
      name: "sort_order",
      type: "int",
      default: 0,
    },
  },
  indices: [{ name: "idx_permissions_category", columns: ["category", "sortOrder"] }],
});

module.exports = { Permission };
