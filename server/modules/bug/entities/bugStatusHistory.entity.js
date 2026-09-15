// modules/bug/entities/bugStatusHistory.entity.js
// One row per status a bug has entered — timestamps power the SLA "paused
// time" calculation and a timeline, same idea as FeedbackStatusHistory.
const { EntitySchema } = require("typeorm");

const BugStatusHistory = new EntitySchema({
  name: "BugStatusHistory",
  tableName: "bug_status_history",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    bugId: {
      name: "bug_id",
      type: "uuid",
    },
    status: {
      type: "varchar",
      length: 30,
    },
    // Not a `createDate` column — callers set this explicitly (the initial
    // "Open" entry is backdated to the bug's own createdAt).
    enteredAt: {
      name: "entered_at",
      type: "timestamptz",
      default: () => "CURRENT_TIMESTAMP",
    },
  },
  relations: {
    bug: {
      type: "many-to-one",
      target: "Bug",
      joinColumn: { name: "bug_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "idx_bug_status_history_bug", columns: ["bugId", "enteredAt"] }],
});

module.exports = { BugStatusHistory };
