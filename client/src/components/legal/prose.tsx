// components/legal/prose.tsx — the small set of typographic building blocks the
// legal documents are written with. Mirrors the helpers in pages/docs/sections.tsx
// so the public pages read consistently; kept separate because these documents
// need a couple of things the docs do not (tables, defined terms, placeholders).
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{children}</p>
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 text-base font-semibold text-foreground">{children}</h3>
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed text-pretty text-muted-foreground marker:text-brand/60">
      {children}
    </ul>
  )
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="ml-5 list-decimal space-y-2 text-sm leading-relaxed text-pretty text-muted-foreground marker:text-brand/60">
      {children}
    </ol>
  )
}

/**
 * Something the operator of this deployment must fill in before publishing —
 * a legal entity name, an address, a governing-law jurisdiction. Rendered so it
 * is impossible to mistake for finished copy, and greppable in the source.
 */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 rounded border border-dashed border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 text-[0.8125rem] font-medium text-amber-700 dark:text-amber-400">
      {children}
    </span>
  )
}

/** Contact address, as a mailto link. */
export function MailTo({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className="font-medium text-brand hover:underline">
      {address}
    </a>
  )
}

/** A defined term, as introduced in the Definitions section. */
export function Term({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">&ldquo;{children}&rdquo;</span>
}

interface DataTableProps {
  caption?: string
  headers: string[]
  rows: ReactNode[][]
  className?: string
}

/** Small reference table — sub-processors, browser storage, retention periods. */
export function DataTable({ caption, headers, rows, className }: DataTableProps) {
  return (
    <figure className={cn("my-2", className)}>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col" className="px-3 py-2.5 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t align-top">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={cn(
                      "px-3 py-2.5 text-muted-foreground",
                      j === 0 && "font-medium text-foreground",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  )
}

/** A pulled-out point that should not be missed — obligations, warnings. */
export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-brand/20 bg-brand-soft/50 px-4 py-3 text-sm leading-relaxed text-pretty dark:bg-brand-soft/20">
      {children}
    </div>
  )
}
