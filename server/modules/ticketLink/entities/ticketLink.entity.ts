// modules/ticketLink/entities/ticketLink.entity.ts
// A relationship between two tickets of the same project — a bug, a feature
// request or a feedback ticket on either side. See the AddTicketLinks migration
// for why this is one polymorphic table.
import { EntitySchema } from "typeorm";

export type TicketType = "bug" | "feature_request" | "feedback";
export type TicketLinkKind = "related" | "duplicate";

export interface TicketLink {
  id: string;
  projectId: string;
  // For a `duplicate` link the source is the repeat and the target is the
  // original. For `related` the pair is stored in a canonical order and carries
  // no direction.
  sourceType: TicketType;
  sourceId: string;
  targetType: TicketType;
  targetId: string;
  linkType: TicketLinkKind;
  createdById: string | null;
  createdAt: Date;
  project?: unknown;
  createdBy?: unknown;
}

const TicketLink = new EntitySchema<TicketLink>({
  name: "TicketLink",
  tableName: "ticket_links",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    projectId: {
      name: "project_id",
      type: "uuid",
    },
    sourceType: {
      name: "source_type",
      type: "varchar",
      length: 20,
    },
    sourceId: {
      name: "source_id",
      type: "uuid",
    },
    targetType: {
      name: "target_type",
      type: "varchar",
      length: 20,
    },
    targetId: {
      name: "target_id",
      type: "uuid",
    },
    linkType: {
      name: "link_type",
      type: "varchar",
      length: 20,
    },
    createdById: {
      name: "created_by_id",
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
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      onDelete: "CASCADE",
    },
    createdBy: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "created_by_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    {
      name: "uq_ticket_links_pair",
      columns: ["sourceType", "sourceId", "targetType", "targetId"],
      unique: true,
    },
    // A ticket is a repeat of at most one original.
    {
      name: "uq_ticket_links_one_original",
      columns: ["sourceType", "sourceId"],
      unique: true,
      where: `"link_type" = 'duplicate'`,
    },
    { name: "idx_ticket_links_target", columns: ["targetType", "targetId"] },
    { name: "idx_ticket_links_project", columns: ["projectId"] },
    { name: "idx_ticket_links_created_by", columns: ["createdById"] },
  ],
});

export { TicketLink };
