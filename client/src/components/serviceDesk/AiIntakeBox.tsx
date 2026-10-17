// components/serviceDesk/AiIntakeBox.tsx — "Describe what you need" on the
// request portal. The AI suggests the catalog item and fills its form from the
// person's words; they land on the normal form to check everything and submit.
// Nothing is saved by the AI. Shown only to people with AI assistance (ai.use).
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAiIntake } from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"
import type { IntakeSuggestion, RequestPrefill } from "@/types/serviceDesk.types"

export function AiIntakeBox() {
  const navigate = useNavigate()
  const intake = useAiIntake()
  const [text, setText] = useState("")
  const [suggestion, setSuggestion] = useState<IntakeSuggestion | null>(null)

  const go = (s: IntakeSuggestion) => {
    if (!s.itemId) return
    const prefill: RequestPrefill = {
      title: s.title,
      formValues: s.formValues,
      priority: s.priority,
      description: text.trim(),
      fromAi: true,
    }
    navigate(`/requests/new/${s.itemId}`, { state: { prefill } })
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base"><Sparkles className="size-4 text-primary" /> Not sure where to start?</CardTitle>
        <CardDescription>Describe what you need and we'll find the right request and fill in what we can. You check it before anything is sent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={3}
          placeholder="e.g. I'm starting on the design team next week and need Figma and Adobe Illustrator on my laptop"
          value={text}
          onChange={(e) => { setText(e.target.value); setSuggestion(null) }}
          data-cy="ai-intake"
        />
        <Button
          size="sm"
          disabled={text.trim().length < 10 || intake.isPending}
          onClick={() =>
            intake.mutate(text.trim(), {
              onSuccess: setSuggestion,
              onError: (e) => toast.error(e instanceof ApiError ? e.message : "The suggestion didn't work — try browsing the catalog instead"),
            })
          }
        >
          <Sparkles className="mr-1 size-3.5" /> {intake.isPending ? "Finding the right request…" : "Suggest a request"}
        </Button>

        {suggestion && (
          <div className="rounded-md border p-3 text-sm">
            {suggestion.item ? (
              <>
                <p className="text-xs text-muted-foreground">{suggestion.item.categoryName}</p>
                <p className="font-medium">{suggestion.item.name}</p>
                {suggestion.reason && <p className="text-muted-foreground">{suggestion.reason}</p>}
                {suggestion.missingInfo.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium">You'll also need to say</p>
                    <ul className="list-disc pl-4 text-xs text-muted-foreground">{suggestion.missingInfo.map((q, i) => <li key={i}>{q}</li>)}</ul>
                  </div>
                )}
                <Button size="sm" className="mt-3" onClick={() => go(suggestion)}>
                  Continue with this <ArrowRight className="ml-1 size-3.5" />
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">Nothing in the catalog matched. Browse the categories below, or use "Something else" under IT solutions.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
