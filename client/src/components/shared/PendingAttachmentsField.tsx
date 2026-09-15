import { useRef } from "react"
import { Upload, X, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

function prettySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

// Holds files locally until the parent entity (bug, feature request, …) is
// created, then the caller uploads them to the real attachments endpoint.
export function PendingAttachmentsField({ files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length > 0) onChange([...files, ...picked])
    if (inputRef.current) inputRef.current.value = ""
  }

  const removeAt = (index: number) => onChange(files.filter((_, i) => i !== index))

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label>Attachments (optional)</Label>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={onPick}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-1 size-4" /> Attach images
        </Button>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.lastModified}-${i}`}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">{prettySize(f.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={disabled}
                  onClick={() => removeAt(i)}
                >
                  <X className="size-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
