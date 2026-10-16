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
import { useCreateFeatureRequest, useUpdateFeatureRequestStatus } from "@/hooks/useFeatureRequests"
import { useLinkPendingTickets } from "@/hooks/useTicketLinks"
import { useSuites } from "@/hooks/useSuites"
import { featureRequestSchema, linesToArray, type FeatureRequestForm } from "@/lib/testMgmtValidation"
import { ApiError } from "@/transport/http"
import { FeatureRequestAttachmentEndpoints } from "@/endpoints/featureRequest.endpoints"
import type { FeatureRequest } from "@/types/featureRequest.types"
import type { PendingTicketLink } from "@/types/ticketLink.types"
import type { FeatureRequestDraft, FollowUpAnswer } from "@/types/ai.types"
import { useFeatureRequestDraft } from "@/hooks/useAi"
import { AiAssistantPanel } from "@/components/ai/AiAssistantPanel"
import { AiFieldMark } from "@/components/ai/AiFieldMark"
import { marksFor, NO_MARKS, shouldFill, type AssistantMarks } from "@/components/ai/assistantMarks"

// Sections the AI may mark as its own suggestion; they live in the Description.
const DESCRIPTION_SECTIONS = ["problemStatement", "proposedSolution", "businessJustification", "expectedOutcome", "acceptanceCriteria"]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  // When set, the dialog corrects this request's write-up instead of filing a
  // new one. Attachments aren't editable here — that stays in the attachments section.
  request?: FeatureRequest
}

export function FeatureRequestFormDialog({ open, onOpenChange, projectId, request }: Props) {
  const isEdit = Boolean(request)
  const create = useCreateFeatureRequest()
  const update = useUpdateFeatureRequestStatus()
  const { data: suites = [] } = useSuites(projectId)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  // Earlier tickets marked as "same problem" / "related" while writing this one —
  // linked once the request exists.
  const [pendingLinks, setPendingLinks] = useState<PendingTicketLink[]>([])
  const linkPending = useLinkPendingTickets()
  // The AI assistant and the fields it filled.
  const draftRequest = useFeatureRequestDraft()
  const [aiMarks, setAiMarks] = useState<AssistantMarks>(NO_MARKS)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FeatureRequestForm>({ resolver: zodResolver(featureRequestSchema) })

  const moduleValue = watch("module")
  const title = watch("title")

  // Prefill once per open — a background refetch of `request` must not wipe
  // what's being typed.
  useEffect(() => {
    if (open) {
      reset({
        title: request?.title ?? "",
        description: request?.description ?? "",
        category: request?.category ?? "",
        module: request?.module ?? "",
        referenceLinksText: request?.referenceLinks.join("\n") ?? "",
      })
      setFiles([])
      setPendingLinks([])
      setAiMarks(NO_MARKS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset])

  // ── The AI assistant: rough idea → title, structured description, category ──
  const hasRequestContent = (v: FeatureRequestForm) => [v.title, v.description].some((s) => (s ?? "").trim())

  const requestDraft = ({ roughDescription, answers, base }: { roughDescription: string; answers: FollowUpAnswer[]; base: FeatureRequestForm }) =>
    draftRequest.mutateAsync({
      projectId,
      roughDescription: roughDescription || undefined,
      answers: answers.length ? answers : undefined,
      form: {
        title: base.title?.trim() || undefined,
        description: base.description?.trim() || undefined,
        category: base.category?.trim() || undefined,
      },
      // The module is a suite of the project, picked by name.
      suiteId: suites.find((s) => s.name === base.module)?.id,
      requestId: request?.id,
    })

  const applyDraft = (draft: FeatureRequestDraft) => {
    const v = getValues()
    const changed: string[] = []
    if (shouldFill(draft.title, v.title)) {
      setValue("title", draft.title, { shouldDirty: true, shouldValidate: true })
      changed.push("title")
    }
    if (shouldFill(draft.description, v.description)) {
      setValue("description", draft.description, { shouldDirty: true, shouldValidate: true })
      changed.push("description")
    }
    // A category is only suggested into an empty box — never over the user's own.
    if (draft.category.trim() && !(v.category ?? "").trim()) {
      setValue("category", draft.category, { shouldDirty: true })
      changed.push("category")
    }
    // Sections to confirm are marked inside the description itself; flag the
    // description so the user looks for them.
    const confirm = draft.needsConfirmation.map((f) => (DESCRIPTION_SECTIONS.includes(f) ? "description" : f))
    setAiMarks(marksFor(changed, confirm))
  }

  const restoreOriginal = (original: FeatureRequestForm) => {
    reset(original)
    setAiMarks(NO_MARKS)
  }

  const onEdit = async (requestToEdit: FeatureRequest, values: FeatureRequestForm) => {
    try {
      // Empty optional fields are sent as null (not omitted) so a mistaken value can be cleared.
      await update.mutateAsync({
        id: requestToEdit.id,
        payload: {
          title: values.title,
          description: values.description,
          category: values.category || null,
          module: values.module || null,
          referenceLinks: linesToArray(values.referenceLinksText ?? ""),
        },
      })
      toast.success("Feature request updated")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed")
    }
  }

  const onSubmit = async (values: FeatureRequestForm) => {
    if (request) return onEdit(request, values)
    const referenceLinks = values.referenceLinksText ? linesToArray(values.referenceLinksText) : undefined
    try {
      const request = await create.mutateAsync({
        projectId,
        title: values.title,
        description: values.description,
        category: values.category || undefined,
        module: values.module || undefined,
        referenceLinks,
      })

      if (files.length > 0) {
        setUploading(true)
        const res = await FeatureRequestAttachmentEndpoints.upload(request.id, files)
        if (!res.success) toast.error(res.message || "Request submitted, but attachments failed to upload")
      }

      if (pendingLinks.length > 0) {
        const { failed } = await linkPending.mutateAsync({
          source: { type: "feature_request", id: request.id },
          pending: pendingLinks,
        })
        if (failed > 0) {
          toast.error(
            `Request submitted, but ${failed} link${failed === 1 ? "" : "s"} couldn't be made — add ${failed === 1 ? "it" : "them"} from the request page`
          )
        }
      }

      toast.success("Feature request submitted")
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
          <DialogTitle>{isEdit ? "Edit feature request" : "Suggest a feature"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Correct the write-up — title, description, category, module, or reference links."
              : "Tell us what you'd like to see in TestMate."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid min-w-0 gap-4" onSubmit={handleSubmit(onSubmit)}>
          <AiAssistantPanel<FeatureRequestForm, FeatureRequestDraft>
            feature="feature_request_draft"
            resetKey={open}
            heading="AI assistant — describe your idea in your own words"
            intro="What would you like, and why? The AI shapes it into a clear request — problem, proposed solution, justification, expected outcome and acceptance criteria — and asks about anything vague. Pick the module first if it's about one area."
            placeholder="e.g. It would be great if we could export test runs to PDF so I can send results to clients."
            disclosure={(provider) =>
              `Sends what you write here, this form's text, the project and module descriptions and up to 3 similar requests to ${provider}. Attachments, reference links, comments and names are not sent.`
            }
            reviewHint={isEdit ? "before you save" : "before you submit the request"}
            pending={draftRequest.isPending}
            snapshot={getValues}
            hasContent={hasRequestContent}
            restore={restoreOriginal}
            request={requestDraft}
            apply={applyDraft}
            extra={(draft) =>
              draft.needsConfirmation.some((f) => DESCRIPTION_SECTIONS.includes(f)) ? (
                <p className="text-muted-foreground">
                  Sections headed "(suggested — please confirm)" are the AI's suggestions. Check them, then remove that note.
                </p>
              ) : null
            }
          />

          <div className="grid gap-1">
            <FormField id="title" label="Title" error={errors.title?.message} {...register("title")} />
            <AiFieldMark field="title" marks={aiMarks} />
          </div>

          {/* Only when filing a new request: has this been suggested before? */}
          {!isEdit && (
            <SimilarTicketsPanel
              projectId={projectId}
              title={title ?? ""}
              pending={pendingLinks}
              onChange={setPendingLinks}
              noun="request"
            />
          )}

          <div className="grid gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <Label htmlFor="description">Description</Label>
              <AiFieldMark field="description" marks={aiMarks} confirmText="Contains AI suggestions to confirm" />
            </span>
            <Textarea id="description" rows={aiMarks.ai.has("description") ? 12 : 4} readOnly={draftRequest.isPending} {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <FormField
                id="category"
                label="Category (optional)"
                placeholder="UI/UX, Reporting, Integration…"
                {...register("category")}
              />
              <AiFieldMark field="category" marks={aiMarks} />
            </div>
            <div className="grid gap-1.5">
              <Label>Module (optional)</Label>
              <Select
                value={moduleValue || "none"}
                onValueChange={(v) => setValue("module", v === "none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Pick a suite" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {suites.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="referenceLinksText">Reference links (optional, one per line)</Label>
            <Textarea
              id="referenceLinksText"
              rows={2}
              placeholder={"https://example.com/mockup\nhttps://docs.example.com/spec"}
              {...register("referenceLinksText")}
            />
          </div>

          {!isEdit && (
            <PendingAttachmentsField files={files} onChange={setFiles} disabled={create.isPending || uploading} />
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || update.isPending || uploading || linkPending.isPending}
              data-cy="feature-request-submit"
            >
              {isEdit
                ? update.isPending ? "Saving…" : "Save changes"
                : uploading ? "Uploading…" : create.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
