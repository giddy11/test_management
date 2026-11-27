// components/review/ReviewReminderSettingsCard.tsx — platform owner only
// (reviewprompt.manage): how often reporters are asked to confirm finished work.
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useReviewPromptSettings, useSaveReviewPromptSettings } from "@/hooks/useReviewPrompts"
import { ApiError } from "@/transport/http"

// Mirrors the server's limits (reviewPrompt.schema).
const MIN_HOURS = 2
const MAX_HOURS = 168

export function ReviewReminderSettingsCard() {
  const { data, isLoading, isError } = useReviewPromptSettings()
  const save = useSaveReviewPromptSettings()
  // Null until edited, so the saved value shows as soon as it loads.
  const [enabledDraft, setEnabled] = useState<boolean | null>(null)
  const [hoursDraft, setHours] = useState<string | null>(null)

  const enabled = enabledDraft ?? data?.enabled ?? true
  const hours = hoursDraft ?? String(data?.intervalHours ?? MIN_HOURS)
  const intervalHours = Number(hours)
  const valid = Number.isInteger(intervalHours) && intervalHours >= MIN_HOURS && intervalHours <= MAX_HOURS

  const submit = () =>
    save.mutate(
      { enabled, intervalHours },
      {
        onSuccess: () => {
          setEnabled(null)
          setHours(null)
          toast.success("Review reminder saved")
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the setting"),
      }
    )

  return (
    <Card data-cy="review-reminder-settings">
      <CardHeader>
        <CardTitle>Review reminder</CardTitle>
        <CardDescription>
          A pop-up asking whoever reported a bug or feature request to confirm it once it is marked
          Fixed or Ready For Review, and reminding assignees of the ones still waiting for their
          work. Applies to every organisation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError ? (
          <p className="text-sm text-destructive">Couldn't load the current setting.</p>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={enabled} disabled={isLoading} onCheckedChange={(v) => setEnabled(Boolean(v))} />
              <span className="text-sm">Show the reminder</span>
            </label>
            <div className="grid max-w-60 gap-1.5">
              <Label htmlFor="review-interval">Hours between reminders</Label>
              <Input
                id="review-interval"
                type="number"
                min={MIN_HOURS}
                max={MAX_HOURS}
                step={1}
                value={hours}
                disabled={isLoading || !enabled}
                onChange={(e) => setHours(e.target.value)}
              />
              <p className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
                A whole number from {MIN_HOURS} to {MAX_HOURS}.
              </p>
            </div>
            <Button onClick={submit} disabled={isLoading || !valid || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
