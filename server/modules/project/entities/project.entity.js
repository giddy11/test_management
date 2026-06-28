// modules/project/entities/project.entity.js
const { EntitySchema } = require("typeorm");

const Project = new EntitySchema({
  name: "Project",
  tableName: "projects",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    name: {
      type: "varchar",
      length: 200,
    },
    description: {
      type: "text",
      nullable: true,
    },
    ownerId: {
      name: "owner_id",
      type: "uuid",
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    deletedAt: {
      name: "deleted_at",
      type: "timestamptz",
      deleteDate: true,
      nullable: true,
    },
  },
  relations: {
    owner: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "owner_id" },
    },
    members: {
      type: "many-to-many",
      target: "User",
      joinTable: {
        name: "project_members",
        joinColumn: { name: "project_id", referencedColumnName: "id" },
        inverseJoinColumn: { name: "user_id", referencedColumnName: "id" },
      },
    },
  },
  indices: [
    { name: "idx_projects_name", columns: ["name"] },
    { name: "idx_projects_owner_id", columns: ["ownerId"] },
    { name: "idx_projects_owner_created", columns: ["ownerId", "createdAt"] },
  ],
});

module.exports = { Project };
