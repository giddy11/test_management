// components/ai/AiFieldMark.tsx — the small label beside a form field the AI
// assistant filled: "Filled by AI", or "AI suggestion — please confirm" when
// it's the AI's inference rather than what the user said.
import { Sparkles } from "lucide-react"
import type { AssistantMarks } from "./assistantMarks"

export function AiFieldMark({ field, marks, confirmText }: { field: string; marks: AssistantMarks; confirmText?: string }) {
  if (marks.confirm.has(field)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-normal text-amber-600" data-cy={`ai-mark-confirm-${field}`}>
        <Sparkles className="size-3" />
        {confirmText ?? "AI suggestion — please confirm"}
      </span>
    )
  }
  if (marks.ai.has(field)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-normal text-primary" data-cy={`ai-mark-${field}`}>
        <Sparkles className="size-3" />
        Filled by AI
      </span>
    )
  }
  return null
}
