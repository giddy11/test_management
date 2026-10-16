// components/ai/AiAssistantPanel.tsx — the AI Bug & Feature Request
// Assistant, shared by the bug and feature-request forms.
//
//   1. The user describes the problem or idea in their own words.
//   2. "Draft" sends that (and whatever is already in the form) to the AI, and
//      the draft fills the form's fields — the form decides how (`apply`).
//   3. The AI's follow-up questions appear with an answer box each; "Update
//      the draft" sends the answers and refines the form.
//   4. "Regenerate" starts again from the user's original text; "Restore my
//      original" puts the form back exactly as it was before the AI touched it.
// Nothing is submitted: the user files the ticket with the form's own button.
// Collapsed by default so the manual form stays the primary path.
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronUp, Paperclip, RotateCcw, Sparkles, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useAuth } from "@/contexts/AuthContext"
import { useAiStatus } from "@/hooks/useAi"
import { ApiError } from "@/transport/http"
import { credits, type AiFeature, type AssistantDraftExtras, type FollowUpAnswer } from "@/types/ai.types"
import { AiDraftButton } from "./AiDraftButton"

interface AiAssistantPanelProps<TSnapshot, TDraft extends AssistantDraftExtras> {
  feature: AiFeature
  // Changes whenever the form is (re)opened; clears the assistant.
  resetKey: unknown
  heading: string
  intro: string
  placeholder: string
  disclosure: (providerLabel: string) => string
  // e.g. "before you report the bug"
  reviewHint: string
  pending: boolean
  snapshot: () => TSnapshot
  hasContent: (s: TSnapshot) => boolean
  restore: (s: TSnapshot) => void
  request: (args: { roughDescription: string; answers: FollowUpAnswer[]; base: TSnapshot }) => Promise<TDraft>
  apply: (draft: TDraft) => void
  // Form-specific notes under the draft (e.g. the suggested severity's reason).
  extra?: (draft: TDraft) => ReactNode
}

export function AiAssistantPanel<TSnapshot, TDraft extends AssistantDraftExtras>(props: AiAssistantPanelProps<TSnapshot, TDraft>) {
  const { feature, resetKey, pending, snapshot, hasContent, restore, request, apply } = props
  const { can } = useAuth()
  const { data: status } = useAiStatus(feature, can("ai.use"))

  const [open, setOpen] = useState(false)
  const [rough, setRough] = useState("")
  // The form exactly as the user had it before the first AI draft.
  const [original, setOriginal] = useState<TSnapshot | null>(null)
  const [draft, setDraft] = useState<TDraft | null>(null)
  // Every question answered so far, carried into each later draft.
  const [answered, setAnswered] = useState<FollowUpAnswer[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setOpen(false)
    setRough("")
    setOriginal(null)
    setDraft(null)
    setAnswered([])
    setAnswers({})
  }, [resetKey])

  // Not set up, or not allowed: AiDraftButton shows a "Set up AI" link to
  // those who can fix it, and nothing to everyone else.
  if (!status?.available) {
    return <AiDraftButton feature={feature} label="Draft with AI" onClick={() => undefined} />
  }

  const run = async (base: TSnapshot, carried: FollowUpAnswer[]) => {
    try {
      const next = await request({ roughDescription: rough.trim(), answers: carried, base })
      apply(next)
      setDraft(next)
      setAnswered(carried)
      setAnswers({})
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "The AI couldn't draft this right now. You can keep writing it yourself.")
    }
  }

  const startDraft = () => {
    setConfirming(false)
    const current = snapshot()
    if (!original) setOriginal(current)
    void run(current, answered)
  }

  const onDraft = () => {
    // The first draft replaces what the user typed — ask, and keep the original.
    if (!original && hasContent(snapshot())) setConfirming(true)
    else startDraft()
  }

  const newAnswers = (draft?.followUpQuestions ?? [])
    .filter((q) => answers[q]?.trim())
    .map((q) => ({ question: q, answer: answers[q].trim() }))

  // Refines what's in the form now (including the user's own edits).
  const onUpdate = () => void run(snapshot(), [...answered, ...newAnswers])

  // A fresh attempt from the user's original text and the answers so far.
  const onRegenerate = () => void run(original ?? snapshot(), [...answered, ...newAnswers])

  const onRestore = () => {
    if (original) restore(original)
    setOriginal(null)
    setDraft(null)
    setAnswered([])
    setAnswers({})
  }

  const canDraft = rough.trim().length > 0 || hasContent(snapshot())

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5" data-cy={`ai-assistant-${feature}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4 text-primary" />
          {props.heading}
        </span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-primary/20 px-3 py-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`ai-rough-${feature}`} className="text-xs font-normal text-muted-foreground">
              {props.intro}
            </Label>
            <Textarea
              id={`ai-rough-${feature}`}
              rows={3}
              maxLength={3000}
              value={rough}
              placeholder={props.placeholder}
              onChange={(e) => setRough(e.target.value)}
              readOnly={pending}
              data-cy="ai-rough-description"
            />
            <p className="text-xs text-muted-foreground">{props.disclosure(status.providerLabel ?? "the AI provider")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AiDraftButton
              feature={feature}
              label={draft ? "Draft again" : "Draft with AI"}
              loading={pending}
              disabled={!canDraft}
              disabledReason="Describe it first"
              onClick={draft ? onUpdate : onDraft}
            />
            {draft && original !== null && (
              <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 px-2.5 text-xs" onClick={onRegenerate} disabled={pending} data-cy="ai-regenerate">
                <RotateCcw className="size-3.5" /> Regenerate
              </Button>
            )}
            {original !== null && (
              <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 px-2.5 text-xs" onClick={onRestore} disabled={pending} data-cy="ai-restore">
                <Undo2 className="size-3.5" /> Restore my original
              </Button>
            )}
          </div>

          {draft && (
            <div className="space-y-3 text-xs" role="status" data-cy="ai-assistant-result">
              <p>
                <span className="font-medium">The form has been filled in</span> — read and edit every field {props.reviewHint}.
                Fields marked <span className="text-amber-600">"please confirm"</span> are the AI's suggestions, not what you said.
                Written by {draft.model}
                {draft.creditsCharged > 0 ? ` · ${credits(draft.creditsCharged)} used` : ""}.
              </p>

              {props.extra?.(draft)}

              {draft.evidenceSuggestion && (
                <p className="flex items-start gap-1.5 text-muted-foreground">
                  <Paperclip className="mt-0.5 size-3.5 shrink-0" />
                  <span>Worth attaching: {draft.evidenceSuggestion}</span>
                </p>
              )}

              {draft.followUpQuestions.length > 0 && (
                <div className="space-y-2" data-cy="ai-follow-up">
                  <p className="font-medium">A few questions to make it complete:</p>
                  {draft.followUpQuestions.map((q, i) => (
                    <div key={q} className="grid gap-1">
                      <Label htmlFor={`ai-answer-${feature}-${i}`} className="text-xs font-normal">{q}</Label>
                      <Input
                        id={`ai-answer-${feature}-${i}`}
                        value={answers[q] ?? ""}
                        maxLength={1000}
                        placeholder="Your answer (optional)"
                        onChange={(e) => setAnswers((a) => ({ ...a, [q]: e.target.value }))}
                        // Enter would submit the whole ticket form.
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            if (newAnswers.length) onUpdate()
                          }
                        }}
                        data-cy="ai-follow-up-answer"
                      />
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onUpdate} disabled={pending || newAnswers.length === 0} data-cy="ai-update-draft">
                    {pending ? "Updating…" : "Update the draft with my answers"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Let the AI fill in the form?"
        description="It will rewrite what you've typed into the form, keeping its facts. Your original is kept — you can restore it at any time."
        confirmLabel="Fill in the form"
        onConfirm={startDraft}
      />
    </div>
  )
}
