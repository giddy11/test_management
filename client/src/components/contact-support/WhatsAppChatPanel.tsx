// components/contact-support/WhatsAppChatPanel.tsx
// The WhatsApp-styled chat view shared by the internal Contact support widget
// and the embeddable WhatsAppWidgetPage — a branded header, a couple of
// static greeting bubbles, and a composer. No real conversation happens here:
// nothing is stored or sent through our backend. Pressing send just builds a
// wa.me link and opens it in a new tab — see each caller's buildWhatsAppUrl.
import { useEffect, useRef } from "react"
import { MessageCircle, Send, X } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

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
  /** Extra content between the header and the chat body (e.g. a product picker). */
  topSlot?: React.ReactNode
  autoFocus?: boolean
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
  topSlot,
  autoFocus = true,
}: Props) {
  const canSend = !disabled && Boolean(message.trim())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

      {topSlot && <div className="shrink-0 border-b px-3 py-2">{topSlot}</div>}

      <div className="flex-1 space-y-2 overflow-y-auto bg-[#e5ddd5] px-3 py-4">
        <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">
          👋 Hi there!
        </div>
        <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">
          How can we help you today?
        </div>
      </div>

      <div className="flex shrink-0 items-end gap-2 bg-[#f0f0f0] p-2">
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
          className="max-h-32 flex-1 resize-none rounded-3xl border-none bg-white px-4 py-2.5 text-sm text-neutral-900 shadow-sm focus-visible:ring-1 focus-visible:ring-[#25d366]"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send on WhatsApp"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white transition-colors hover:bg-[#20bd5a] disabled:opacity-40"
        >
          <Send className="size-4.5" />
        </button>
      </div>
    </div>
  )
}
