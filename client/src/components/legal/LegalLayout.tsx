// components/legal/LegalLayout.tsx — shared shell for the Privacy Policy and
// Terms & Conditions. Standalone like DocsPage, but reusing the landing header
// and footer so the public pages read as one site.
import { useEffect } from "react"
import { Link } from "react-router-dom"
import { ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LandingHeader } from "@/components/landing/LandingHeader"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { useScrollSpy } from "@/hooks/useScrollSpy"
import type { LegalDocument } from "@/components/legal/types"

interface LegalLayoutProps {
  document: LegalDocument
  /** The sibling document, linked at the foot of the page. */
  counterpart: { label: string; to: string }
}

export function LegalLayout({ document: doc, counterpart }: LegalLayoutProps) {
  const ids = doc.sections.map((section) => section.id)
  const activeId = useScrollSpy(ids)

  // Honour deep links (/privacy#retention) — on a fresh load the browser's own
  // anchor jump happens before React has rendered the target element.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id && ids.includes(id)) window.document.getElementById(id)?.scrollIntoView()
    // Deliberately once, on mount: re-running on every ids identity change
    // would yank the reader back to the anchor mid-scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-svh bg-background" data-cy="legal-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <LandingHeader />

      {/* Title band */}
      <div className="border-b bg-linear-to-b from-brand-soft/50 to-background dark:from-brand-soft/20">
        <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 sm:py-16">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-background/70 px-3 py-1 text-xs font-semibold tracking-wide text-brand uppercase">
              <span className="size-1.5 rounded-full bg-brand" aria-hidden />
              {doc.eyebrow}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {doc.title}
            </h1>
            <p className="mt-4 text-base text-pretty text-muted-foreground">{doc.intro}</p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Last updated</dt>
                <dd className="font-medium">{doc.lastUpdated}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Effective</dt>
                <dd className="font-medium">{doc.effective}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[90rem] gap-12 px-4 sm:px-6">
        <aside className="sticky top-16 hidden max-h-[calc(100svh-4rem)] w-64 shrink-0 overflow-y-auto py-10 lg:block">
          <p className="px-2 text-sm font-semibold">On this page</p>
          <nav aria-label="Sections" className="mt-3">
            <ol className="space-y-0.5">
              {doc.sections.map((section, i) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={activeId === section.id ? "true" : undefined}
                    className={`flex gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      activeId === section.id
                        ? "bg-brand-soft/60 font-medium text-brand dark:bg-brand-soft/30"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <span className="tabular-nums opacity-60">{i + 1}.</span>
                    <span>{section.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <main id="main" className="min-w-0 max-w-3xl flex-1 py-10">
          <ol className="space-y-12">
            {doc.sections.map((section, i) => (
              <li key={section.id} id={section.id} className="scroll-mt-20">
                <div className="mb-4 border-b pb-3">
                  <h2 className="flex gap-3 text-xl font-semibold tracking-tight">
                    <span className="text-brand tabular-nums">{i + 1}.</span>
                    {section.title}
                  </h2>
                </div>
                <div className="space-y-4">{section.body}</div>
              </li>
            ))}
          </ol>

          <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
            <p className="text-sm text-muted-foreground">
              See also{" "}
              <Link to={counterpart.to} className="font-medium text-brand hover:underline">
                {counterpart.label}
              </Link>
              .
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="#main">
                <ArrowUp className="size-4" aria-hidden />
                Back to top
              </a>
            </Button>
          </div>
        </main>

        {/* Balances the sticky nav so the prose column stays optically centred. */}
        <div className="hidden w-64 shrink-0 xl:block" aria-hidden />
      </div>

      <LandingFooter />
    </div>
  )
}
