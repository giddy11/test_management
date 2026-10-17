// components/serviceDesk/RequestFiles.tsx — files on an IT request:
// FilePicker holds files before a request exists (the form), and
// RequestAttachments shows, adds and removes them once it does.
import { useRef } from "react"
import { FileText, Paperclip, Trash2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { When } from "@/components/serviceDesk/RequestBits"
import { useDeleteRequestFile, useUploadRequestFiles } from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"
import type { RequestAttachment } from "@/types/serviceDesk.types"

// Mirrors the server's upload filter (images, PDF, Word, Excel; 10 MB, 10 files).
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,.doc,.docx,.xls,.xlsx"
const MAX_MB = 10
const MAX_FILES = 10

function prettySize(bytes: number | null) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function keepValid(picked: File[], room: number): File[] {
  const tooBig = picked.filter((f) => f.size > MAX_MB * 1024 * 1024)
  if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over ${MAX_MB} MB`)
  const ok = picked.filter((f) => f.size <= MAX_MB * 1024 * 1024)
  if (ok.length > room) toast.error(`A request can have at most ${MAX_FILES} files`)
  return ok.slice(0, Math.max(room, 0))
}

export function FilePicker({ files, onChange, disabled }: { files: File[]; onChange: (f: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label>Attachments (optional)</Label>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            onChange([...files, ...keepValid(Array.from(e.target.files ?? []), MAX_FILES - files.length)])
            if (input.current) input.current.value = ""
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
          <Upload className="mr-1 size-4" /> Attach files
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Screenshots, quotes or forms — images, PDF, Word or Excel, up to {MAX_MB} MB each.</p>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.lastModified}-${i}`} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{prettySize(f.size)}</span>
              </span>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label="Remove">
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RequestAttachments({
  requestId,
  files,
  canAttach,
  canRemoveAny,
  myUserId,
}: {
  requestId: string
  files: RequestAttachment[]
  canAttach: boolean
  canRemoveAny: boolean
  myUserId: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadRequestFiles()
  const remove = useDeleteRequestFile()
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

  if (!files.length && !canAttach) return null
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-1.5 text-base"><Paperclip className="size-4" /> Files</CardTitle>
        {canAttach && files.length < MAX_FILES && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                const picked = keepValid(Array.from(e.target.files ?? []), MAX_FILES - files.length)
                if (input.current) input.current.value = ""
                if (picked.length) {
                  upload.mutate({ id: requestId, files: picked }, { onSuccess: () => toast.success("Files added"), onError: fail })
                }
              }}
            />
            <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
              <Upload className="mr-1 size-3.5" /> {upload.isPending ? "Uploading…" : "Add files"}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-md border p-2">
                <a href={f.fileUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  {f.isImage ? (
                    <img src={f.fileUrl} alt={f.fileName} className="size-12 rounded object-cover" />
                  ) : (
                    <span className="flex size-12 items-center justify-center rounded bg-muted"><FileText className="size-5 text-muted-foreground" /></span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a href={f.fileUrl} target="_blank" rel="noreferrer" className="block truncate text-sm hover:underline">{f.fileName}</a>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.uploadedBy?.name ?? "Someone"} · <When at={f.createdAt} /> {f.fileSizeBytes ? `· ${prettySize(f.fileSizeBytes)}` : ""}
                  </p>
                </div>
                {(canRemoveAny || (canAttach && f.uploadedBy?.id === myUserId)) && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${f.fileName}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: requestId, attachmentId: f.id }, { onSuccess: () => toast.success("File removed"), onError: fail })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
