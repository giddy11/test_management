// components/support-chat/ChatComposer.tsx
// Shared message composer for the support widget and the admin inbox. Supports
// light Markdown formatting (via a small toolbar that wraps the selection),
// image attachments, and a taller auto-growing input for longer messages.
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Bold, Italic, Code, List, Paperclip, Send, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const MAX_FILES = 5
const MAX_FILE_MB = 5
const ACCEPT = "image/png,image/jpeg,image/webp"
const MAX_LEN = 5000

interface Props {
  onSend: (body: string, files: File[]) => Promise<unknown>
  pending: boolean
  placeholder?: string
  className?: string
}

export function ChatComposer({ onSend, pending, placeholder, className }: Props) {
  const [draft, setDraft] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Object URLs for the local previews — created once per file set and revoked
  // when it changes/unmounts (createObjectURL on every render would leak).
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  // Wraps the current selection with Markdown markers (e.g. **bold**). With no
  // selection it inserts the markers and drops the caret between them.
  const wrapSelection = (before: string, after = before) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = draft.slice(start, end)
    const next = draft.slice(0, start) + before + selected + after + draft.slice(end)
    setDraft(next.slice(0, MAX_LEN))
    requestAnimationFrame(() => {
      el.focus()
      const caret = start + before.length + selected.length
      el.setSelectionRange(caret, caret)
    })
  }

  // Prefixes each line touched by the selection with "- " (bulleted list).
  const prefixLines = (prefix: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const lineStart = draft.lastIndexOf("\n", start - 1) + 1
    const block = draft.slice(lineStart, end)
    const prefixed = block
      .split("\n")
      .map((l) => (l.startsWith(prefix) ? l : prefix + l))
      .join("\n")
    setDraft((draft.slice(0, lineStart) + prefixed + draft.slice(end)).slice(0, MAX_LEN))
    requestAnimationFrame(() => el.focus())
  }

  const addFiles = (incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith("image/"))
    const tooBig = images.find((f) => f.size > MAX_FILE_MB * 1024 * 1024)
    if (tooBig) {
      toast.error(`Images must be ${MAX_FILE_MB}MB or smaller`)
      return
    }
    if (incoming.some((f) => !f.type.startsWith("image/"))) {
      toast.error("Only image files can be attached")
    }
    setFiles((prev) => {
      const next = [...prev, ...images]
      if (next.length > MAX_FILES) toast.error(`Up to ${MAX_FILES} images per message`)
      return next.slice(0, MAX_FILES)
    })
  }

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = "" // allow re-selecting the same file
  }

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  const handleSend = () => {
    const body = draft.trim()
    if (pending || (!body && files.length === 0)) return
    const sentFiles = files
    setDraft("")
    setFiles([])
    onSend(body, sentFiles).catch(() => {
      toast.error("Couldn't send your message — please try again")
      setDraft(body)
      setFiles(sentFiles)
    })
  }

  return (
    <div className={cn("space-y-2", className)}>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              <img
                src={previews[i]}
                alt={f.name}
                className="size-14 rounded-md border object-cover"
              />
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

      <div className="flex items-center gap-0.5">
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => wrapSelection("**")} aria-label="Bold" title="Bold">
          <Bold />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => wrapSelection("*")} aria-label="Italic" title="Italic">
          <Italic />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => wrapSelection("`")} aria-label="Code" title="Code">
          <Code />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => prefixLines("- ")} aria-label="Bulleted list" title="Bulleted list">
          <List />
        </Button>
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
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={placeholder ?? "Type your message…  (Shift+Enter for a new line)"}
          rows={2}
          className="max-h-48 min-h-16 resize-none"
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
