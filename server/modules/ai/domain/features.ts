// modules/ai/domain/features.ts
// THE list of AI features. A feature's id is its key in the usage log, the
// per-feature model map (ai_credentials.feature_models) and the credit price
// list. The client mirrors this tuple in client/src/types/ai.types.ts — keep
// the two in step.
export const AI_FEATURES = ["test_case_draft", "bug_report_draft"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export function isAiFeature(value: unknown): value is AiFeature {
  return typeof value === "string" && (AI_FEATURES as readonly string[]).includes(value);
}
