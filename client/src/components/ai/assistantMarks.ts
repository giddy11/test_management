// components/ai/assistantMarks.ts — which form fields the AI assistant filled,
// and which of those are its own suggestion that the user must confirm
// (rather than something the user said). Shown beside each field's label.

export interface AssistantMarks {
  ai: ReadonlySet<string>
  confirm: ReadonlySet<string>
}

export const NO_MARKS: AssistantMarks = { ai: new Set(), confirm: new Set() }

export function marksFor(changed: Iterable<string>, needsConfirmation: Iterable<string>): AssistantMarks {
  const ai = new Set(changed)
  return { ai, confirm: new Set([...needsConfirmation].filter((f) => ai.has(f))) }
}

// Fills a form field from a draft only when the draft has something to say,
// or the field is empty. The AI returns "" for what it doesn't know, and that
// must never wipe what the user typed.
export function shouldFill(next: string, current: string | undefined | null): boolean {
  return next.trim() !== "" ? next.trim() !== (current ?? "").trim() : false
}
