// modules/serviceDesk/entities/serviceRequestAttachment.entity.ts
// A file on a request — a screenshot, a quote, a signed form. Images go to
// Cloudinary as images, documents as "raw" files; resourceType decides which
// delete call removes it.
import { EntitySchema } from "typeorm";

export interface ServiceRequestAttachment {
  id: string;
  requestId: string;
  fileName: string;
  fileUrl: string;
  filePublicId: string;
  resourceType: "image" | "raw";
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedById: string | null;
  createdAt: Date;
  request?: object;
  uploadedBy?: object;
}

const ServiceRequestAttachment = new EntitySchema<ServiceRequestAttachment>({
  name: "ServiceRequestAttachment",
  tableName: "service_request_attachments",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    requestId: { name: "request_id", type: "uuid" },
    fileName: { name: "file_name", type: "varchar", length: 255 },
    fileUrl: { name: "file_url", type: "text" },
    filePublicId: { name: "file_public_id", type: "varchar", length: 255 },
    resourceType: { name: "resource_type", type: "varchar", length: 10, default: "image" },
    mimeType: { name: "mime_type", type: "varchar", length: 120, nullable: true },
    fileSizeBytes: { name: "file_size_bytes", type: "int", nullable: true },
    uploadedById: { name: "uploaded_by_id", type: "uuid", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    request: { type: "many-to-one", target: "ServiceRequest", joinColumn: { name: "request_id" }, onDelete: "CASCADE" },
    uploadedBy: { type: "many-to-one", target: "User", joinColumn: { name: "uploaded_by_id" }, nullable: true, onDelete: "SET NULL" },
  },
  indices: [{ name: "idx_service_request_attachments_request", columns: ["requestId", "createdAt"] }],
});

export { ServiceRequestAttachment };
