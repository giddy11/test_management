// components/shared/LinkedText.tsx — makes web addresses inside free text
// clickable, wherever they sit in a sentence. Output is React nodes, never HTML,
// so whatever someone typed can't inject markup.
import type { ReactNode } from "react"

// "https://…", "http://…" or a bare "www.…", up to the next space, <> or quote.
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"“”]+/gi
const SENTENCE_PUNCTUATION = ".,;:!?…'’*"
const BRACKETS: Record<string, string> = { ")": "(", "]": "[", "}": "{" }

// What ends the sentence, or closes a bracket around the address, isn't part of
// it — but a bracket the address opened itself is.
function trimUrl(url: string): string {
  let end = url.length
  while (end > 0) {
    const last = url[end - 1]
    const opener = BRACKETS[last]
    if (opener) {
      const head = url.slice(0, end)
      if (head.split(last).length <= head.split(opener).length) break
    } else if (!SENTENCE_PUNCTUATION.includes(last)) {
      break
    }
    end--
  }
  return url.slice(0, end)
}

export function LinkedText({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index
    const url = trimUrl(match[0])
    const bare = /^www\./i.test(url)
    // A prefix with nothing after it, or "www." in the middle of a word or an
    // email address, is just text.
    if (!/^(?:https?:\/\/|www\.)[^./?#]/i.test(url)) continue
    if (bare && /[\w@./-]/.test(text.charAt(start - 1))) continue
    nodes.push(
      text.slice(last, start),
      <a
        key={start}
        href={bare ? `https://${url}` : url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 wrap-anywhere hover:opacity-80"
        // The text may sit inside something clickable; the link wins.
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    )
    last = start + url.length
  }
  nodes.push(text.slice(last))
  return <>{nodes}</>
}
