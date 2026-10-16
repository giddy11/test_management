// modules/ai/entities/aiUsageLog.entity.ts
// One row per AI request — counts only. Append-only, and deliberately holds
// NO prompt or reply content: what was asked and answered never lands here.
import { EntitySchema } from "typeorm";

export interface AiUsageLog {
  id: string;
  organizationId: string;
  userId: string;
  keySource: "user" | "organization";
  provider: string;
  model: string;
  feature: string;
  // The project the request was about, when there was one.
  projectId: string | null;
  inputTokens: number;
  outputTokens: number;
  status: "ok" | "error";
  errorKind: string | null;
  durationMs: number;
  createdAt: Date;
  user?: unknown;
  project?: unknown;
}

const AiUsageLog = new EntitySchema<AiUsageLog>({
  name: "AiUsageLog",
  tableName: "ai_usage_logs",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    userId: { name: "user_id", type: "uuid" },
    keySource: { name: "key_source", type: "varchar", length: 20 },
    provider: { type: "varchar", length: 20 },
    model: { type: "varchar", length: 200 },
    feature: { type: "varchar", length: 50 },
    projectId: { name: "project_id", type: "uuid", nullable: true },
    inputTokens: { name: "input_tokens", type: "int", default: 0 },
    outputTokens: { name: "output_tokens", type: "int", default: 0 },
    status: { type: "varchar", length: 10 },
    errorKind: { name: "error_kind", type: "varchar", length: 30, nullable: true },
    durationMs: { name: "duration_ms", type: "int", default: 0 },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      onDelete: "CASCADE",
    },
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    { name: "idx_ai_usage_logs_org_created", columns: ["organizationId", "createdAt"] },
    { name: "idx_ai_usage_logs_user_created", columns: ["userId", "createdAt"] },
  ],
});

export { AiUsageLog };
