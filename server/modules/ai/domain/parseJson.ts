// modules/ai/domain/parseJson.ts
// Tolerant JSON extraction from a model reply. Real-world replies wrap the
// object in reasoning (<think>…</think>), code fences or a sentence of prose.
// Returns undefined when no JSON object can be recovered.
export function parseJson(text: string): unknown {
  const cleaned = String(text ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  if (!cleaned) return undefined;
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to the slice
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
