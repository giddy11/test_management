// components/live-chat-widget/WidgetMessageBody.tsx
// Renders a live-chat message: plain text with autolinked URLs, plus image
// attachments. Deliberately simpler than the internal support-chat's
// ChatMessageBody (no Markdown toolbar/parsing) — a website visitor types a
// quick message, not formatted text. Output is built as React nodes — never
// dangerouslySetInnerHTML — so it can't inject HTML.
import type { ReactNode } from "react"
import type { LiveChatAttachment } from "@/types/liveChat.types"

const URL_SOURCE = "https?:\\/\\/[^\\s]+"

function renderBody(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  const re = new RegExp(URL_SOURCE, "g")
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(
      <a
        key={i++}
        href={m[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {m[0]}
      </a>
    )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function WidgetMessageBody({
  body,
  attachments,
}: {
  body: string
  attachments: LiveChatAttachment[]
}) {
  return (
    <div className="space-y-2">
      {body && (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{renderBody(body)}</p>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name ?? undefined}>
              <img
                src={a.url}
                alt={a.name ?? "attachment"}
                loading="lazy"
                className="max-h-40 max-w-[11rem] rounded-lg border border-black/10 object-cover dark:border-white/15"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
