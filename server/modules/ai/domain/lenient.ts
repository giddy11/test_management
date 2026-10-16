// modules/ai/domain/lenient.ts
// Lenient Zod building blocks for model replies.
//
// Hosted providers enforce the JSON schema themselves, but open models often
// get the content right and the form slightly wrong (a list where a string was
// asked for, "high" for "High", a missing optional). These accept the near
// misses so a usable draft isn't thrown away, while a genuinely missing or
// meaningless essential still fails — and describeRejection() tells the model
// what was wrong on its one retry.
import { z } from "zod";

// null/undefined → ""; array → lines; object → JSON; anything else → String.
export const looseText = z.preprocess((v) => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}, z.string());

// null/undefined → [].
export const looseList = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => (v === null || v === undefined ? [] : v), z.array(item));

const keyOf = (v: unknown) => String(v).trim().toLowerCase().replace(/[\s_-]+/g, "");

function matchChoice<T extends string>(values: readonly T[], v: unknown): T | undefined {
  if (typeof v !== "string") return undefined;
  const k = keyOf(v);
  return values.find((value) => keyOf(value) === k);
}

// Case-, space- and underscore-insensitive enum; anything else → fallback.
// For fields where a wrong answer is harmless (a suggestion the human sees).
export const looseChoice = <T extends string>(values: readonly [T, ...T[]], fallback: T) =>
  z.preprocess((v) => matchChoice(values, v) ?? fallback, z.enum(values));

// Same matching, plus aliases ("approved" → "accepted"); an unknown value
// stays an error. For fields where guessing would change the meaning.
export const strictChoice = <T extends string>(values: readonly [T, ...T[]], aliases: Record<string, T> = {}) => {
  const aliasByKey = new Map(Object.entries(aliases).map(([k, v]) => [keyOf(k), v] as const));
  return z.preprocess((v) => matchChoice(values, v) ?? (typeof v === "string" ? aliasByKey.get(keyOf(v)) : undefined) ?? v, z.enum(values));
};

// Fed back to the model on its retry, so it knows what to fix.
export function describeRejection(json: unknown, error: z.ZodError | null): string {
  if (json === undefined || json === null || typeof json !== "object" || Array.isArray(json)) {
    return "it was not a JSON object";
  }
  if (!error) return "it did not match the required format";
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}

// Cut to a field's maximum length, at a word boundary when one is close.
export function fit(value: string, max: number): string {
  const text = (value ?? "").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd();
}
