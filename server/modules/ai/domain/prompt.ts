// modules/ai/domain/prompt.ts
// Prompt-building helpers shared by every feature.
//
// User-authored text (case steps, bug notes, suite descriptions) is MATERIAL,
// not instructions: each source is wrapped in an XML-style tag and the system
// prompt tells the model to ignore any instructions inside. inert() stops that
// text from closing or opening one of our tags itself.

// Every tag any feature prompt uses. Add a feature's tags here.
export const PROMPT_TAGS = [
  "intent",
  "suite",
  "current_draft",
  "existing_cases",
  "notes",
  "test_case",
  "run_result",
  "not_visible_to_you",
] as const;

const TAG_PATTERN = new RegExp(`<\\/?(${PROMPT_TAGS.join("|")})\\b`, "gi");

// "<notes>" in user text becomes "‹notes>", which no longer reads as a tag.
export function inert(text: string): string {
  return String(text ?? "").replace(TAG_PATTERN, (m) => `‹${m.slice(1)}`);
}

// A tagged section, or "" when there's nothing to put in it.
export function section(tag: (typeof PROMPT_TAGS)[number], body: string | null | undefined): string {
  const text = (body ?? "").trim();
  return text ? `<${tag}>\n${text}\n</${tag}>` : "";
}

export function joinSections(...parts: string[]): string {
  return parts.filter(Boolean).join("\n\n");
}
