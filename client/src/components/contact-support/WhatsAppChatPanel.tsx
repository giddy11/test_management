// components/contact-support/WhatsAppChatPanel.tsx
// The WhatsApp-styled chat view behind both WhatsApp widgets — a branded
// header, a couple of static greeting bubbles, and a composer. No real
// conversation happens here; see WhatsAppTicketPanel for what send does
// (logs a ticket, then hands off to WhatsApp).
import { useEffect, useRef } from "react"
import { Loader2, MessageCircle, Paperclip, Send, X } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

// The panel is always light (WhatsApp-styled) — form fields inside it pin
// their colors so the app's dark theme can't turn them into light text on a
// white card.
export const WHATSAPP_FIELD_CLASS =
  "h-8 border-neutral-300 bg-white text-sm text-neutral-900 placeholder:text-neutral-400 dark:bg-white"

interface Props {
  title: string
  subtitle?: string
  message: string
  onMessageChange: (value: string) => void
  onSend: () => void
  onClose: () => void
  maxLength: number
  placeholder?: string
  /** True when there's nothing valid to send to yet (e.g. no product chosen). */
  disabled?: boolean
  /** True while a send is in flight — locks the composer. */
  sending?: boolean
  /** Extra content between the header and the chat body (e.g. a product picker). */
  topSlot?: React.ReactNode
  /** Extra chat-body content below the greeting bubbles (e.g. a details form). */
  children?: React.ReactNode
  /** Replaces the composer entirely (e.g. once a message has been sent). */
  footer?: React.ReactNode
  /** The two static "Hi there!" bubbles — off when the body is a real conversation. */
  showGreeting?: boolean
  autoFocus?: boolean
  /**
   * Turns on the composer's paperclip. The caller owns the list (and decides
   * what's acceptable — size, count, type); a message may then be just files.
   */
  attachments?: {
    files: File[]
    accept: string
    onAdd: (files: File[]) => void
    onRemove: (index: number) => void
  }
}

export function WhatsAppChatPanel({
  title,
  subtitle = "Typically replies within a few hours",
  message,
  onMessageChange,
  onSend,
  onClose,
  maxLength,
  placeholder = "Type a message",
  disabled = false,
  sending = false,
  topSlot,
  children,
  footer,
  showGreeting = true,
  autoFocus = true,
  attachments,
}: Props) {
  const hasFiles = Boolean(attachments?.files.length)
  const canSend = !disabled && !sending && (Boolean(message.trim()) || hasFiles)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
          <MessageCircle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-white/80">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      {topSlot && <div className="shrink-0 border-b border-neutral-200 px-3 py-2">{topSlot}</div>}

      <div className="flex-1 space-y-2 overflow-y-auto bg-[#e5ddd5] px-3 py-4">
        {showGreeting && (
          <>
            <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">
              👋 Hi there!
            </div>
            <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">
              How can we help you today?
            </div>
          </>
        )}
        {children}
      </div>

      {!footer && attachments && hasFiles && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-neutral-200 bg-[#f0f0f0] px-2 pt-2">
          {attachments.files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="flex max-w-full items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-neutral-700 shadow-sm"
            >
              <span className="max-w-40 truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => attachments.onRemove(i)}
                disabled={sending}
                aria-label={`Remove ${f.name}`}
                className="shrink-0 rounded-full text-neutral-500 hover:text-neutral-800"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {footer ?? (
        <div className="flex shrink-0 items-end gap-2 bg-[#f0f0f0] p-2">
          {attachments && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={attachments.accept}
                multiple
                hidden
                onChange={(e) => {
                  attachments.onAdd(Array.from(e.target.files ?? []))
                  e.target.value = "" // lets the same file be picked again after removing it
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                aria-label="Attach files"
                title="Attach images, PDF, Word or Excel files"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-200 disabled:opacity-40"
              >
                <Paperclip className="size-4.5" />
              </button>
            </>
          )}
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (canSend) onSend()
              }
            }}
            placeholder={placeholder}
            rows={1}
            maxLength={maxLength}
            disabled={sending}
            className="max-h-32 flex-1 resize-none rounded-3xl border-none bg-white px-4 py-2.5 text-sm text-neutral-900 shadow-sm focus-visible:ring-1 focus-visible:ring-[#25d366]"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send on WhatsApp"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white transition-colors hover:bg-[#20bd5a] disabled:opacity-40"
          >
            {sending ? <Loader2 className="size-4.5 animate-spin" /> : <Send className="size-4.5" />}
          </button>
        </div>
      )}
    </div>
  )
}
