// modules/serviceDesk/entities/serviceRequestComment.entity.ts
// The conversation on a request. isInternal notes are IT's own — the
// requester, the person it's for and approvers never see them.
import { EntitySchema } from "typeorm";

export interface ServiceRequestComment {
  id: string;
  requestId: string;
  authorId: string | null;
  body: string;
  isInternal: boolean;
  createdAt: Date;
  request?: object;
  author?: object;
}

const ServiceRequestComment = new EntitySchema<ServiceRequestComment>({
  name: "ServiceRequestComment",
  tableName: "service_request_comments",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    requestId: { name: "request_id", type: "uuid" },
    authorId: { name: "author_id", type: "uuid", nullable: true },
    body: { type: "text" },
    isInternal: { name: "is_internal", type: "boolean", default: false },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    request: { type: "many-to-one", target: "ServiceRequest", joinColumn: { name: "request_id" }, onDelete: "CASCADE" },
    author: { type: "many-to-one", target: "User", joinColumn: { name: "author_id" }, nullable: true, onDelete: "SET NULL" },
  },
  indices: [{ name: "idx_service_request_comments_request", columns: ["requestId", "createdAt"] }],
});

export { ServiceRequestComment };
