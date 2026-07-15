// components/support-chat/ChatMessageBody.tsx
// Renders a support-chat message: a small, safe subset of Markdown (bold, italic,
// inline code, bulleted lists, autolinked URLs) plus image attachments. Output is
// built as React nodes — never dangerouslySetInnerHTML — so it can't inject HTML.
import type { ReactNode } from "react"
import type { SupportChatMessage } from "@/types/supportChat.types"

// Order matters: code first (so ** inside code isn't treated as bold), then bold,
// italic (* or _), then bare URLs.
const INLINE_SOURCE = "(`[^`]+`)|(\\*\\*[^*]+\\*\\*)|(\\*[^*]+\\*)|(_[^_]+_)|(https?:\\/\\/[^\\s]+)"

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  // A fresh regex per call — renderInline recurses (for bold/italic contents),
  // and a shared /g regex's lastIndex would be clobbered by the inner loop.
  const re = new RegExp(INLINE_SOURCE, "g")
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    const key = `${keyPrefix}-${i++}`
    if (m[1]) {
      nodes.push(
        <code key={key} className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/15">
          {token.slice(1, -1)}
        </code>
      )
    } else if (m[2]) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>)
    } else if (m[3] || m[4]) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>)
    } else if (m[5]) {
      nodes.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {token}
        </a>
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function renderBlocks(body: string): ReactNode[] {
  const lines = body.split("\n")
  const blocks: ReactNode[] = []
  let bullets: string[] = []

  const flushBullets = (key: string) => {
    if (!bullets.length) return
    const items = bullets
    bullets = []
    blocks.push(
      <ul key={key} className="list-disc space-y-0.5 pl-5">
        {items.map((li, idx) => (
          <li key={idx}>{renderInline(li, `${key}-${idx}`)}</li>
        ))}
      </ul>
    )
  }

  lines.forEach((line, idx) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) {
      bullets.push(bullet[1])
      return
    }
    flushBullets(`ul-${idx}`)
    if (line.trim() === "") {
      blocks.push(<div key={`sp-${idx}`} className="h-2" />)
      return
    }
    blocks.push(
      <p key={`p-${idx}`} className="whitespace-pre-wrap break-words">
        {renderInline(line, `p-${idx}`)}
      </p>
    )
  })
  flushBullets("ul-end")
  return blocks
}

export function ChatMessageBody({ message }: { message: SupportChatMessage }) {
  return (
    <div className="space-y-2">
      {message.body && <div className="space-y-1 text-sm leading-relaxed">{renderBlocks(message.body)}</div>}
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.attachments.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name ?? undefined}>
              <img
                src={a.url}
                alt={a.name ?? "attachment"}
                loading="lazy"
                className="max-h-44 max-w-[13rem] rounded-lg border border-black/10 object-cover dark:border-white/15"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
