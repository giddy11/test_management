import { useRef, useState } from "react"
import { Upload, Trash2, ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { InlineLoader } from "@/components/shared/PageLoader"
import {
  useBugAttachments,
  useUploadBugAttachments,
  useDeleteBugAttachment,
} from "@/hooks/useBugAttachments"
import { ApiError } from "@/transport/http"
import type { BugAttachment } from "@/types/bug.types"

function prettySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function BugAttachmentsSection({ bugId }: { bugId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: items = [], isLoading } = useBugAttachments(bugId)
  const upload = useUploadBugAttachments(bugId)
  const del = useDeleteBugAttachment(bugId)
  const [deleting, setDeleting] = useState<BugAttachment | null>(null)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    upload.mutate(files, {
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Upload failed"),
      onSuccess: () => toast.success("Uploaded"),
    })
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Attachments ({items.length})</h3>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={onPick}
        />
        <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
          <Upload className="mr-1 size-4" /> {upload.isPending ? "Uploading…" : "Attach images"}
        </Button>
      </div>

      {isLoading && <InlineLoader className="py-6" />}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-6 text-center">
          <ImageIcon className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No screenshots attached.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((a) => (
          <div key={a.id} className="group relative overflow-hidden rounded-lg border">
            <a href={a.fileUrl} target="_blank" rel="noreferrer">
              <img src={a.fileUrl} alt={a.fileName} className="aspect-video w-full object-cover" />
            </a>
            <div className="flex items-center justify-between gap-1 px-2 py-1.5">
              <span className="truncate text-xs text-muted-foreground" title={a.fileName}>{a.fileName}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{prettySize(a.fileSizeBytes)}</span>
            </div>
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-1 top-1 size-7 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => setDeleting(a)}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete attachment"
        description={`"${deleting?.fileName ?? "This image"}" will be removed.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
            onSuccess: () => { toast.success("Attachment deleted"); setDeleting(null) },
          })
        }
      />
    </div>
  )
}
