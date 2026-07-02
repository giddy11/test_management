// modules/featureRequest/entities/featureRequestAttachment.entity.js
// Metadata for optional screenshots/images attached to a feature request.
const { EntitySchema } = require("typeorm");

const FeatureRequestAttachment = new EntitySchema({
  name: "FeatureRequestAttachment",
  tableName: "feature_request_attachments",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    featureRequestId: {
      name: "feature_request_id",
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
    featureRequest: {
      type: "many-to-one",
      target: "FeatureRequest",
      joinColumn: { name: "feature_request_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [
    { name: "idx_fr_attachments_feature_request_id", columns: ["featureRequestId"] },
    { name: "idx_fr_attachments_uploaded_by_id", columns: ["uploadedById"] },
  ],
});

module.exports = { FeatureRequestAttachment };
