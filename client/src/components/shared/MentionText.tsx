import type { CommentMention } from "@/lib/commentThreads"

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Highlights "@Full Name" tokens that match one of the comment's recorded
// mentions. Matching by name (not scanning for arbitrary "@word" patterns)
// keeps this in sync with what the server actually validated and notified —
// stray "@" text a user typed without picking a suggestion just renders as
// plain text.
export function MentionText({ body, mentions }: { body: string; mentions: CommentMention[] }) {
  if (mentions.length === 0) return <>{body}</>

  // Longest names first, so "Jane" can't shadow a match for "Jane Doe".
  const names = [...new Set(mentions.map((m) => m.name))].sort((a, b) => b.length - a.length)
  const pattern = names.map(escapeRegExp).join("|")
  const parts = body.split(new RegExp(`(@(?:${pattern}))`, "g"))

  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") && names.includes(part.slice(1)) ? (
          <span key={i} className="font-medium text-primary">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}
