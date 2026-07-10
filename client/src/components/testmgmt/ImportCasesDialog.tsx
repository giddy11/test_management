import { useRef, useState } from "react"
import { Upload, FileSpreadsheet, Download } from "lucide-react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PriorityBadge, CaseStatusBadge } from "@/components/shared/StatusBadge"
import { useUploadImport, useConfirmImport } from "@/hooks/useImport"
import { ImportEndpoints } from "@/endpoints/testMgmt.endpoints"
import { ApiError } from "@/transport/http"
import type { ImportPreview, ImportRowError } from "@/types/testMgmt.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  suiteId: string
}

export function ImportCasesDialog({ open, onOpenChange, suiteId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadImport(suiteId)
  const confirm = useConfirmImport(suiteId)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([])
  const [fileName, setFileName] = useState("")

  const reset = () => {
    setPreview(null)
    setRowErrors([])
    setFileName("")
    if (inputRef.current) inputRef.current.value = ""
  }

  const close = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  const downloadTemplate = () => {
    ImportEndpoints.downloadTemplate().catch(() => toast.error("Could not download template"))
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setRowErrors([])
    upload.mutate(file, {
      onSuccess: (data) => setPreview(data),
      onError: (err) => {
        if (err instanceof ApiError && Array.isArray(err.errors) && err.errors.length) {
          setRowErrors(err.errors as unknown as ImportRowError[])
        }
        toast.error(err instanceof ApiError ? err.message : "Upload failed")
      },
    })
    if (inputRef.current) inputRef.current.value = ""
  }

  const onConfirm = () => {
    if (!preview) return
    confirm.mutate(preview.importId, {
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import failed"),
      onSuccess: (res) => {
        const parts = [`Imported ${res.created} test case${res.created === 1 ? "" : "s"}`]
        if (res.duplicatesSkipped && res.duplicatesSkipped > 0) {
          parts.push(`${res.duplicatesSkipped} duplicate${res.duplicatesSkipped === 1 ? "" : "s"} skipped`)
        }
        toast.success(parts.join(" · "))
        close(false)
      },
    })
  }

  const duplicates = preview?.duplicates ?? []
  const skipped = preview?.skipped ?? []

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import test cases</DialogTitle>
          <DialogDescription>
            Download the template, fill it in, then upload to preview before saving.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate} data-cy="import-template">
                <Download className="mr-1 size-4" /> Download template
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                data-cy="import-file"
                onChange={onPick}
              />
              <Button size="sm" disabled={upload.isPending} onClick={() => inputRef.current?.click()} data-cy="import-pick">
                <Upload className="mr-1 size-4" /> {upload.isPending ? "Parsing…" : "Choose .xlsx file"}
              </Button>
              {fileName && (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <FileSpreadsheet className="size-4" /> {fileName}
                </span>
              )}
            </div>

            {rowErrors.length > 0 && (
              <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  Fix these rows in your sheet and re-upload:
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {rowErrors.map((e) => (
                    <li key={e.row}>
                      <span className="font-medium text-foreground">Row {e.row}:</span>{" "}
                      {e.issues.map((i) => `${i.field} — ${i.message}`).join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary line */}
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{preview.totalRows}</span> test case{preview.totalRows === 1 ? "" : "s"} ready to import
              {skipped.length > 0 && (
                <> · <span className="text-amber-600">{skipped.length} row{skipped.length === 1 ? "" : "s"} skipped</span> (incomplete)</>
              )}
              {duplicates.length > 0 && (
                <> · <span className="text-blue-600">{duplicates.length} duplicate{duplicates.length === 1 ? "" : "s"} skipped</span></>
              )}
            </p>

            {/* Validation errors */}
            {skipped.length > 0 && (
              <details className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
                <summary className="cursor-pointer font-medium text-amber-800 dark:text-amber-300">
                  {skipped.length} row{skipped.length === 1 ? "" : "s"} skipped — incomplete data
                </summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {skipped.slice(0, 30).map((e) => (
                    <li key={e.row}>
                      <span className="font-medium text-foreground">Row {e.row}</span>
                      {e.title ? ` — ${e.title}` : ""}: {e.issues.map((i) => i.message).join("; ")}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Duplicates */}
            {duplicates.length > 0 && (
              <details className="rounded-lg border border-blue-300/50 bg-blue-50 p-3 text-sm dark:border-blue-900/50 dark:bg-blue-950/30">
                <summary className="cursor-pointer font-medium text-blue-800 dark:text-blue-300">
                  {duplicates.length} duplicate{duplicates.length === 1 ? "" : "s"} skipped — will not be imported
                </summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {duplicates.map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {d.reason === "duplicate in file" ? "In file" : "Exists"}
                      </span>
                      <span className="font-medium text-foreground">{d.title}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Preview table */}
            {preview.totalRows > 0 ? (
              <div className="max-h-80 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Steps</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell><PriorityBadge value={r.priority} /></TableCell>
                        <TableCell><CaseStatusBadge value={r.status} /></TableCell>
                        <TableCell className="text-muted-foreground">{r.steps.length}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                All rows in this file already exist in the suite — nothing to import.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {preview ? (
            <>
              <Button variant="ghost" onClick={reset}>Back</Button>
              <Button onClick={onConfirm} disabled={confirm.isPending || preview.totalRows === 0} data-cy="import-confirm">
                {confirm.isPending
                  ? "Importing…"
                  : preview.totalRows === 0
                  ? "Nothing to import"
                  : `Import ${preview.totalRows} test case${preview.totalRows === 1 ? "" : "s"}`}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
