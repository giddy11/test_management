// modules/feedback/entities/feedbackLookupCode.entity.ts
// Codes emailed to a ticket submitter so they can view every ticket they've
// raised (by email, across all projects/companies) without an account. Only
// the SHA-256 hash of the code is stored — never the raw digits. Reusable
// for repeated lookups until it expires (see FeedbackService.listMyTickets)
// — consumedAt is only ever set when newer codes push it out of the few kept
// live per email (invalidateAllButNewest), not by a successful lookup.
import { EntitySchema } from "typeorm";

export interface FeedbackLookupCode {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

const FeedbackLookupCode = new EntitySchema<FeedbackLookupCode>({
  name: "FeedbackLookupCode",
  tableName: "feedback_lookup_codes",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    email: {
      type: "varchar",
      length: 255,
    },
    codeHash: {
      name: "code_hash",
      type: "varchar",
      length: 255,
    },
    expiresAt: {
      name: "expires_at",
      type: "timestamptz",
    },
    consumedAt: {
      name: "consumed_at",
      type: "timestamptz",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  indices: [{ name: "idx_feedback_lookup_codes_email", columns: ["email"] }],
});

export { FeedbackLookupCode };
