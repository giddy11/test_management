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
import { useCreateBug, useManageBug } from "@/hooks/useBugs"
import { useSuites } from "@/hooks/useSuites"
import { useCase, useCases } from "@/hooks/useCases"
// import { useRuns } from "@/hooks/useRuns" // related-test-run picker removed
import { bugSchema, linesToArray, type BugForm } from "@/lib/testMgmtValidation"
import { BUG_SEVERITIES, BUG_PRIORITIES } from "@/lib/enums"
import { ApiError } from "@/transport/http"
import { BugAttachmentEndpoints } from "@/endpoints/bug.endpoints"
import type { Bug } from "@/types/bug.types"

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
  // Related-test-run picker removed from the form (kept commented below in case
  // it comes back) — so the runs query is disabled too.
  // const { data: runs = [] } = useRuns(projectId)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
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

  const severity = watch("severity")
  const priority = watch("priority")
  const suiteId = watch("suiteId")
  const testCaseId = watch("testCaseId")

  const { data: casesData } = useCases(suiteId || "")
  const cases = casesData?.data ?? []

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bug" : "Report a bug"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Correct any mistakes in this report."
              : "Describe the defect so it can be triaged and fixed."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
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

          <FormField id="title" label="Title" error={errors.title?.message} {...register("title")} />

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="stepsToReproduceText">Steps to reproduce (optional, one per line)</Label>
            <Textarea
              id="stepsToReproduceText"
              rows={3}
              placeholder={"Go to the login page\nEnter an invalid password\nClick Sign in"}
              {...register("stepsToReproduceText")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="expectedBehavior">Expected behavior (optional)</Label>
              <Textarea id="expectedBehavior" rows={2} {...register("expectedBehavior")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="actualBehavior">Actual behavior (optional)</Label>
              <Textarea id="actualBehavior" rows={2} {...register("actualBehavior")} />
            </div>
          </div>

          <FormField
            id="environment"
            label="Environment (optional)"
            placeholder="Prod / Chrome 125 / Windows 11"
            {...register("environment")}
          />

          {!isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Severity</Label>
                <Select value={severity} onValueChange={(v) => setValue("severity", v as BugForm["severity"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUG_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Priority</Label>
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
              disabled={create.isPending || update.isPending || uploading}
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
