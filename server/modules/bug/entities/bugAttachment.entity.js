// modules/bug/entities/bugAttachment.entity.js
// Metadata for optional screenshots/images attached to a bug report.
const { EntitySchema } = require("typeorm");

const BugAttachment = new EntitySchema({
  name: "BugAttachment",
  tableName: "bug_attachments",
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
    fileName: {
      name: "file_name",
      type: "varchar",
      length: 255,
    },
    fileUrl: {
      name: "file_url",
      type: "text",
    },
    // Cloudinary public id — required to delete/transform the asset later.
    filePublicId: {
      name: "file_public_id",
      type: "varchar",
      length: 255,
      nullable: true,
    },
    mimeType: {
      name: "mime_type",
      type: "varchar",
      length: 100,
    },
    fileSizeBytes: {
      name: "file_size_bytes",
      type: "integer",
    },
    uploadedById: {
      name: "uploaded_by_id",
      type: "uuid",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
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
  indices: [
    { name: "idx_bug_attachments_bug_id", columns: ["bugId"] },
    { name: "idx_bug_attachments_uploaded_by_id", columns: ["uploadedById"] },
  ],
});

module.exports = { BugAttachment };
