import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormField } from "@/components/shared/FormField"
import { PendingAttachmentsField } from "@/components/shared/PendingAttachmentsField"
import { SimilarTicketsPanel } from "@/components/tickets/SimilarTicketsPanel"
import { useCreateBug, useManageBug } from "@/hooks/useBugs"
import { useLinkPendingTickets } from "@/hooks/useTicketLinks"
import { useSuites } from "@/hooks/useSuites"
import { useCase, useCases } from "@/hooks/useCases"
// import { useRuns } from "@/hooks/useRuns" // related-test-run picker removed
import { bugSchema, linesToArray, type BugForm } from "@/lib/testMgmtValidation"
import { BUG_SEVERITIES, BUG_PRIORITIES } from "@/lib/enums"
import { ApiError } from "@/transport/http"
import { BugAttachmentEndpoints } from "@/endpoints/bug.endpoints"
import type { Bug } from "@/types/bug.types"
import type { PendingTicketLink } from "@/types/ticketLink.types"
import type { BugReportDraft } from "@/types/ai.types"
import { useBugReportDraft } from "@/hooks/useAi"
import { AiAssistantPanel } from "@/components/ai/AiAssistantPanel"
import { AiFieldMark } from "@/components/ai/AiFieldMark"
import { marksFor, NO_MARKS, shouldFill, type AssistantMarks } from "@/components/ai/assistantMarks"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  // When set, the dialog corrects this bug's report instead of filing a new one.
  // Severity/priority (they drive SLA targets) and attachments aren't editable
  // here — those stay in the Manage dialog and the attachments section.
  bug?: Bug
}

export function BugFormDialog({ open, onOpenChange, projectId, bug }: Props) {
  const isEdit = Boolean(bug)
  const create = useCreateBug()
  const update = useManageBug()
  const { data: suites = [] } = useSuites(projectId)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  // Earlier tickets marked as "same problem" / "related" while writing this one —
  // linked once the bug exists.
  const [pendingLinks, setPendingLinks] = useState<PendingTicketLink[]>([])
  const linkPending = useLinkPendingTickets()
  // The AI assistant (whole-form drafts) and the fields it filled.
  const draftReport = useBugReportDraft()
  const [aiMarks, setAiMarks] = useState<AssistantMarks>(NO_MARKS)
  // Related-test-run picker removed from the form (kept commented below in case
  // it comes back) — so the runs query is disabled too.
  // const { data: runs = [] } = useRuns(projectId)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<BugForm>({ resolver: zodResolver(bugSchema) })

  // Prefill once per open — a background refetch of `bug` must not wipe what's
  // being typed.
  useEffect(() => {
    if (open) {
      reset({
        title: bug?.title ?? "",
        description: bug?.description ?? "",
        stepsToReproduceText: bug?.stepsToReproduce.join("\n") ?? "",
        expectedBehavior: bug?.expectedBehavior ?? "",
        actualBehavior: bug?.actualBehavior ?? "",
        environment: bug?.environment ?? "",
        severity: bug?.severity ?? "Minor",
        priority: bug?.priority ?? "Medium",
        testRunId: "",
        suiteId: "",
        testCaseId: bug?.testCaseId ?? "",
      })
      setFiles([])
      setPendingLinks([])
      setAiMarks(NO_MARKS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset])

  // A bug only stores its test case id; the suite picker needs the case's suite,
  // which may arrive after the form is reset (declared after the reset effect so
  // it wins when the case is already cached).
  const { data: linkedCase } = useCase(bug?.testCaseId ?? "")
  const linkedSuiteId = linkedCase?.suiteId
  useEffect(() => {
    if (open && linkedSuiteId) setValue("suiteId", linkedSuiteId)
  }, [open, linkedSuiteId, setValue])

  const title = watch("title")
  const severity = watch("severity")
  const priority = watch("priority")
  const suiteId = watch("suiteId")
  const testCaseId = watch("testCaseId")

  const { data: casesData } = useCases(suiteId || "")
  const cases = casesData?.data ?? []

  // ── The AI assistant: rough description → every field ─────────────────────
  const hasBugContent = (v: BugForm) =>
    [v.title, v.description, v.stepsToReproduceText, v.expectedBehavior, v.actualBehavior, v.environment].some((s) => (s ?? "").trim())

  const requestReport = ({ roughDescription, answers, base }: { roughDescription: string; answers: { question: string; answer: string }[]; base: BugForm }) =>
    draftReport.mutateAsync({
      projectId,
      roughDescription: roughDescription || undefined,
      answers: answers.length ? answers : undefined,
      form: {
        title: base.title?.trim() || undefined,
        description: base.description?.trim() || undefined,
        stepsToReproduce: linesToArray(base.stepsToReproduceText ?? ""),
        expectedBehavior: base.expectedBehavior?.trim() || undefined,
        actualBehavior: base.actualBehavior?.trim() || undefined,
        environment: base.environment?.trim() || undefined,
      },
      testCaseId: base.testCaseId || undefined,
      suiteId: base.suiteId || undefined,
      bugId: bug?.id,
    })

  const applyReport = (draft: BugReportDraft) => {
    const v = getValues()
    const changed: string[] = []
    const fill = (field: "title" | "description" | "expectedBehavior" | "actualBehavior" | "environment", next: string, mark: string = field) => {
      if (!shouldFill(next, v[field])) return
      setValue(field, next, { shouldDirty: true, shouldValidate: true })
      changed.push(mark)
    }
    fill("title", draft.title)
    fill("description", draft.description)
    fill("expectedBehavior", draft.expectedBehavior)
    fill("actualBehavior", draft.actualBehavior)
    fill("environment", draft.environment)
    const steps = draft.stepsToReproduce.join("\n")
    if (shouldFill(steps, v.stepsToReproduceText)) {
      setValue("stepsToReproduceText", steps, { shouldDirty: true })
      changed.push("stepsToReproduce")
    }
    // Severity and priority are only set when filing (they drive SLA targets),
    // and only ever as a suggestion — marked for confirmation.
    if (!isEdit && draft.severity && draft.severity !== v.severity) {
      setValue("severity", draft.severity, { shouldDirty: true })
      changed.push("severity")
    }
    if (!isEdit && draft.priority && draft.priority !== v.priority) {
      setValue("priority", draft.priority, { shouldDirty: true })
      changed.push("priority")
    }
    setAiMarks(marksFor(changed, draft.needsConfirmation))
  }

  const restoreOriginal = (original: BugForm) => {
    reset(original)
    setAiMarks(NO_MARKS)
  }

  const onEdit = async (bugToEdit: Bug, values: BugForm) => {
    try {
      // Empty fields are sent as null/[] (not omitted) so a mistaken value can be cleared.
      await update.mutateAsync({
        id: bugToEdit.id,
        payload: {
          title: values.title,
          description: values.description,
          stepsToReproduce: linesToArray(values.stepsToReproduceText ?? ""),
          expectedBehavior: values.expectedBehavior || null,
          actualBehavior: values.actualBehavior || null,
          environment: values.environment || null,
          testCaseId: values.testCaseId || null,
        },
      })
      toast.success("Bug updated")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed")
    }
  }

  const onSubmit = async (values: BugForm) => {
    if (bug) return onEdit(bug, values)
    const stepsToReproduce = values.stepsToReproduceText
      ? linesToArray(values.stepsToReproduceText)
      : undefined
    try {
      const bug = await create.mutateAsync({
        projectId,
        title: values.title,
        description: values.description,
        stepsToReproduce,
        expectedBehavior: values.expectedBehavior || undefined,
        actualBehavior: values.actualBehavior || undefined,
        environment: values.environment || undefined,
        severity: values.severity,
        priority: values.priority,
        testRunId: values.testRunId || undefined,
        testCaseId: values.testCaseId || undefined,
      })

      if (files.length > 0) {
        setUploading(true)
        const res = await BugAttachmentEndpoints.upload(bug.id, files)
        if (!res.success) toast.error(res.message || "Bug reported, but attachments failed to upload")
      }

      if (pendingLinks.length > 0) {
        const { failed } = await linkPending.mutateAsync({
          source: { type: "bug", id: bug.id },
          pending: pendingLinks,
        })
        if (failed > 0) {
          toast.error(
            `Bug reported, but ${failed} link${failed === 1 ? "" : "s"} couldn't be made — add ${failed === 1 ? "it" : "them"} from the bug page`
          )
        }
      }

      toast.success("Bug reported")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bug" : "Report a bug"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Correct any mistakes in this report."
              : "Describe the defect so it can be triaged and fixed."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid min-w-0 gap-4" onSubmit={handleSubmit(onSubmit)}>
          <AiAssistantPanel<BugForm, BugReportDraft>
            feature="bug_report_draft"
            resetKey={open}
            heading="AI assistant — describe the bug in your own words"
            intro="What happened? Write it however it comes to you; the AI organises it into the form below and asks about anything missing. Pick the related test case first if there is one."
            placeholder="e.g. When I upload a screenshot to a bug report, nothing happens after I click submit."
            disclosure={(provider) =>
              `Sends what you write here, this form's text, the project and suite descriptions, the related test case and up to 3 similar bugs to ${provider}. Attachments, comments and names are not sent.`
            }
            reviewHint={isEdit ? "before you save" : "before you report the bug"}
            pending={draftReport.isPending}
            snapshot={getValues}
            hasContent={hasBugContent}
            restore={restoreOriginal}
            request={requestReport}
            apply={applyReport}
            extra={(draft) =>
              !isEdit && (draft.severity || draft.priority) ? (
                <p className="text-muted-foreground" data-cy="ai-severity-reason">
                  Suggested {[draft.severity && `severity ${draft.severity}`, draft.priority && `priority ${draft.priority}`].filter(Boolean).join(" and ")}
                  {draft.severityReason ? ` — ${draft.severityReason}` : ""}. Check them against your project's rules before you file.
                </p>
              ) : null
            }
          />

          {/* Related test case first — optional, but the most valuable triage context. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Related test case (optional)</Label>
              <Select
                value={suiteId || "none"}
                onValueChange={(v) => {
                  setValue("suiteId", v === "none" ? "" : v)
                  setValue("testCaseId", "")
                }}
              >
                <SelectTrigger><SelectValue placeholder="Pick a suite first" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {suiteId && (
              <div className="grid gap-1.5">
                <Label>Test case</Label>
                <Select value={testCaseId || "none"} onValueChange={(v) => setValue("testCaseId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {cases.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid gap-1">
            <FormField id="title" label="Title" error={errors.title?.message} {...register("title")} />
            <AiFieldMark field="title" marks={aiMarks} />
          </div>

          {/* Only when filing a new bug: has this been reported before? */}
          {!isEdit && (
            <SimilarTicketsPanel
              projectId={projectId}
              title={title ?? ""}
              pending={pendingLinks}
              onChange={setPendingLinks}
              noun="bug"
            />
          )}

          <div className="grid gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <Label htmlFor="description">Description</Label>
              <AiFieldMark field="description" marks={aiMarks} />
            </span>
            <Textarea
              id="description"
              rows={aiMarks.ai.has("description") ? 8 : 3}
              // readOnly, not disabled: react-hook-form drops disabled fields' values.
              readOnly={draftReport.isPending}
              {...register("description")}
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <Label htmlFor="stepsToReproduceText">Steps to reproduce (optional, one per line)</Label>
              <AiFieldMark field="stepsToReproduce" marks={aiMarks} />
            </span>
            <Textarea
              id="stepsToReproduceText"
              rows={3}
              placeholder={"Go to the login page\nEnter an invalid password\nClick Sign in"}
              {...register("stepsToReproduceText")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="flex flex-wrap items-center gap-2">
                <Label htmlFor="expectedBehavior">Expected behavior (optional)</Label>
                <AiFieldMark field="expectedBehavior" marks={aiMarks} />
              </span>
              <Textarea id="expectedBehavior" rows={2} {...register("expectedBehavior")} />
            </div>
            <div className="grid gap-1.5">
              <span className="flex flex-wrap items-center gap-2">
                <Label htmlFor="actualBehavior">Actual behavior (optional)</Label>
                <AiFieldMark field="actualBehavior" marks={aiMarks} />
              </span>
              <Textarea id="actualBehavior" rows={2} {...register("actualBehavior")} />
            </div>
          </div>

          <div className="grid gap-1">
            <FormField
              id="environment"
              label="Environment (optional)"
              placeholder="Prod / Chrome 125 / Windows 11"
              {...register("environment")}
            />
            <AiFieldMark field="environment" marks={aiMarks} />
          </div>

          {!isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Label>Severity</Label>
                  <AiFieldMark field="severity" marks={aiMarks} confirmText="AI suggestion — check project rules" />
                </span>
                <Select value={severity} onValueChange={(v) => setValue("severity", v as BugForm["severity"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUG_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Label>Priority</Label>
                  <AiFieldMark field="priority" marks={aiMarks} confirmText="AI suggestion — check project rules" />
                </span>
                <Select value={priority} onValueChange={(v) => setValue("priority", v as BugForm["priority"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUG_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!isEdit && (
            <PendingAttachmentsField files={files} onChange={setFiles} disabled={create.isPending || uploading} />
          )}

          {/* Related test run — removed as not needed (kept for reference):
          <div className="grid gap-1.5">
            <Label>Related test run (optional)</Label>
            <Select
              value={testRunId || "none"}
              onValueChange={(v) => setValue("testRunId", v === "none" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {runs.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          */}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || update.isPending || uploading || linkPending.isPending}
              data-cy="bug-submit"
            >
              {isEdit
                ? update.isPending ? "Saving…" : "Save changes"
                : uploading ? "Uploading…" : create.isPending ? "Submitting…" : "Report bug"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
