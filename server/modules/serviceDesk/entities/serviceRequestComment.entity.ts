// modules/serviceDesk/entities/serviceRequestComment.entity.ts
// The conversation on a request. isInternal notes are IT's own — the
// requester, the person it's for and approvers never see them.
//
// A reply sits under a root message (parentId; replying to a reply threads
// under that reply's own root). Deleting keeps the row as a tombstone — body
// and mentions cleared, deletedAt set — so replies stay attached.
import { EntitySchema } from "typeorm";

export interface CommentMention {
  id: string;
  name: string;
}

export interface ServiceRequestComment {
  id: string;
  requestId: string;
  authorId: string | null;
  body: string;
  isInternal: boolean;
  parentId: string | null;
  mentions: CommentMention[];
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedById: string | null;
  createdAt: Date;
  request?: object;
  author?: object;
  parent?: object;
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
    parentId: { name: "parent_id", type: "uuid", nullable: true },
    mentions: { type: "jsonb", default: () => "'[]'" },
    editedAt: { name: "edited_at", type: "timestamptz", nullable: true },
    deletedAt: { name: "deleted_at", type: "timestamptz", nullable: true },
    deletedById: { name: "deleted_by_id", type: "uuid", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    request: { type: "many-to-one", target: "ServiceRequest", joinColumn: { name: "request_id" }, onDelete: "CASCADE" },
    author: { type: "many-to-one", target: "User", joinColumn: { name: "author_id" }, nullable: true, onDelete: "SET NULL" },
    parent: { type: "many-to-one", target: "ServiceRequestComment", joinColumn: { name: "parent_id" }, nullable: true, onDelete: "SET NULL" },
  },
  indices: [{ name: "idx_service_request_comments_request", columns: ["requestId", "createdAt"] }],
});

export { ServiceRequestComment };
