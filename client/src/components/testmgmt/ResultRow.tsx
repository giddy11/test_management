import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Paperclip, X, Upload, ImageIcon, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ResultBadge, PriorityBadge } from "@/components/shared/StatusBadge"
import { cn } from "@/lib/utils"
import { RESULT_STATUSES, RESULT_META, type ResultStatus } from "@/lib/enums"
import { useRecordResult } from "@/hooks/useRuns"
import { useResultAttachments, useUploadResultAttachments, useDeleteResultAttachment } from "@/hooks/useAttachments"
import { ApiError } from "@/transport/http"
import type { TestRunResult } from "@/types/testMgmt.types"
import type { TcPriority } from "@/lib/enums"

interface Props {
  runId: string
  result: TestRunResult
  caseTitle: string
  projectId: string
  suiteId: string
  disabled?: boolean
}

export function ResultRow({ runId, result, caseTitle, projectId, suiteId, disabled }: Props) {
  const record = useRecordResult(runId)
  const [notesOpen, setNotesOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showAttachments, setShowAttachments] = useState(false)
  const [notes, setNotes] = useState(result.notes ?? "")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: attachments = [] } = useResultAttachments(showAttachments ? result.id : "")
  const upload = useUploadResultAttachments(result.id)
  const deleteAttachment = useDeleteResultAttachment(result.id)

  const setStatus = (status: ResultStatus) => {
    const next = result.status === status ? null : status
    record.mutate(
      { id: result.id, payload: { status: next } },
      { onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed") }
    )
  }

  const saveNotes = () => {
    record.mutate(
      { id: result.id, payload: { notes: notes || null } },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => { toast.success("Note saved"); setNotesOpen(false) },
      }
    )
  }

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    upload.mutate(files, {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Upload failed"),
      onSuccess: () => toast.success(`${files.length} image${files.length === 1 ? "" : "s"} uploaded`),
    })
    e.target.value = ""
  }

  const caseUrl = `/projects/${projectId}/suites/${suiteId}/cases/${result.testCaseId}`

  return (
    <div className="rounded-lg border">
      {/* Main row */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: status + title + scenario */}
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <ResultBadge value={result.status} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold">{caseTitle}</span>
              {result.casePriority && (
                <PriorityBadge value={result.casePriority as TcPriority} />
              )}
            </div>
            {result.caseDescription && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                {result.caseDescription}
              </p>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {RESULT_STATUSES.map((s) => {
            const active = result.status === s
            return (
              <Button
                key={s}
                size="sm"
                variant="outline"
                disabled={disabled || record.isPending}
                onClick={() => setStatus(s)}
                className={cn("h-7", active && "border-transparent text-white")}
                style={active ? { backgroundColor: RESULT_META[s].color } : undefined}
              >
                {RESULT_META[s].label}
              </Button>
            )
          })}
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setNotesOpen((o) => !o)}>
            {result.notes ? "Note ✓" : "Note"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setShowAttachments((o) => !o)}
          >
            <Paperclip className="size-3 mr-1" />
            {attachments.length > 0 ? attachments.length : "Attach"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setDetailsOpen((o) => !o)}
            title="View test case details"
          >
            {detailsOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </Button>
        </div>
      </div>

      {/* Expanded details panel */}
      {detailsOpen && (
        <div className="border-t bg-muted/30 px-3 py-3 space-y-3 text-sm">
          {result.caseDescription && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Test Scenario</p>
              <p className="text-sm">{result.caseDescription}</p>
            </div>
          )}
          {result.caseSteps && result.caseSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Steps</p>
              <ol className="list-decimal list-inside space-y-0.5 text-sm">
                {result.caseSteps.map((step, i) => (
                  <li key={i} className="text-muted-foreground">{step}</li>
                ))}
              </ol>
            </div>
          )}
          {result.caseExpectedResult && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Expected Result</p>
              <p className="text-sm">{result.caseExpectedResult}</p>
            </div>
          )}
          <Link
            to={caseUrl}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3" /> View full test case
          </Link>
        </div>
      )}

      {/* Notes panel */}
      {notesOpen && (
        <div className="border-t px-3 py-3 space-y-2">
          <Textarea
            rows={2}
            placeholder="Notes / actual result…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={saveNotes} disabled={record.isPending}>Save note</Button>
          </div>
        </div>
      )}

      {/* Attachments panel */}
      {showAttachments && (
        <div className="border-t px-3 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Attachments</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              disabled={upload.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3 mr-1" />
              {upload.isPending ? "Uploading…" : "Upload image"}
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={onFilePick} />
          </div>

          {attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No attachments yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="group relative">
                  <a href={a.fileUrl} target="_blank" rel="noreferrer">
                    {a.mimeType.startsWith("image/") ? (
                      <img
                        src={a.fileUrl}
                        alt={a.fileName}
                        className="h-16 w-16 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-muted">
                        <ImageIcon className="size-5 text-muted-foreground" />
                      </div>
                    )}
                  </a>
                  <button
                    onClick={() =>
                      deleteAttachment.mutate(a.id, {
                        onError: () => toast.error("Failed to delete"),
                      })
                    }
                    className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-destructive text-white group-hover:flex"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
