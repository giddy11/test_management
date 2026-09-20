// modules/access/entities/permissionCategory.entity.js
// One row per section in the role editor — the card heading and its one-line
// description. Code-owned, refreshed from permissions.catalog.js on seed.
const { EntitySchema } = require("typeorm");

const PermissionCategory = new EntitySchema({
  name: "PermissionCategory",
  tableName: "permission_categories",
  columns: {
    key: {
      type: "varchar",
      length: 40,
      primary: true,
    },
    label: {
      type: "varchar",
      length: 80,
    },
    description: {
      type: "text",
      nullable: true,
    },
    sortOrder: {
      name: "sort_order",
      type: "int",
      default: 0,
    },
  },
});

module.exports = { PermissionCategory };
