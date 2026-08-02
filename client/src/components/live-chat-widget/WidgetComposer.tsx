// components/live-chat-widget/WidgetComposer.tsx
// The widget's message input: text + an optional image attachment, no
// Markdown toolbar (deliberately simpler than the internal ChatComposer —
// see WidgetMessageBody for the matching rationale).
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Paperclip, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const MAX_FILES = 5
const MAX_FILE_MB = 5
const ACCEPT = "image/png,image/jpeg,image/webp"
const MAX_LEN = 5000

interface Props {
  onSend: (body: string, files: File[]) => Promise<unknown>
  pending: boolean
  placeholder?: string
}

export function WidgetComposer({ onSend, pending, placeholder }: Props) {
  const [draft, setDraft] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const addFiles = (incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith("image/"))
    const tooBig = images.find((f) => f.size > MAX_FILE_MB * 1024 * 1024)
    if (tooBig) {
      setError(`Images must be ${MAX_FILE_MB}MB or smaller`)
      return
    }
    setFiles((prev) => [...prev, ...images].slice(0, MAX_FILES))
  }

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ""
  }

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  const handleSend = () => {
    const body = draft.trim()
    if (pending || (!body && files.length === 0)) return
    setError(null)
    onSend(body, files)
      .then(() => {
        setDraft("")
        setFiles([])
      })
      .catch(() => setError("Couldn't send your message — please try again"))
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              <img src={previews[i]} alt={f.name} className="size-12 rounded-md border object-cover" />
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-white"
                aria-label={`Remove ${f.name}`}
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach image"
          title="Attach image"
        >
          <Paperclip />
        </Button>
        <input ref={fileInputRef} type="file" accept={ACCEPT} multiple hidden onChange={onFileInput} />
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={placeholder ?? "Type a message…"}
          rows={1}
          className="max-h-32 min-h-9 resize-none py-2"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={pending || (!draft.trim() && files.length === 0)}
          aria-label="Send message"
        >
          <Send />
        </Button>
      </div>
    </div>
  )
}
