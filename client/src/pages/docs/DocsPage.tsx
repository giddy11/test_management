// pages/docs/DocsPage.tsx — public product documentation at /docs.
// Standalone layout (no DashboardLayout): sticky header, searchable grouped
// section nav with read-progress tracking, Sheet-based nav on mobile, and a
// Quick Start rail on wide screens. Content lives in ./sections.tsx.
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Check, FlaskConical, Link2, Menu, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { useAuth } from "@/contexts/AuthContext"
import { DOC_GROUPS, DOC_SECTIONS } from "./sections"

const SECTION_IDS = DOC_SECTIONS.map((s) => s.id)
const READ_STORAGE_KEY = "tm_docs_read"

const QUICK_START = [
  { label: "Create your organisation", href: "#getting-started" },
  { label: "Add your team", href: "#team" },
  { label: "Set up a project", href: "#projects" },
  { label: "Write test cases", href: "#suites-and-cases" },
  { label: "Run your tests", href: "#test-runs" },
]

function useScrollSpy(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0] ?? "")

  useEffect(() => {
    // Active section = the last one whose top sits at or above the reading
    // line (just below the sticky header; sections use scroll-mt-20 = 80px).
    let ticking = false
    const update = () => {
      ticking = false
      let current = ids[0] ?? ""
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 96) current = id
      }
      // The last section can be too short to ever cross the reading line, so
      // reaching the bottom of the page counts as reading it.
      const bottomReached =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      if (bottomReached && ids.length > 0) current = ids[ids.length - 1]
      setActiveId(current)
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [ids])

  return activeId
}

function loadReadIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => SECTION_IDS.includes(id)) : []
  } catch {
    return []
  }
}

function ReadCheckbox({ read }: { read: boolean }) {
  return (
    <span
      className={`flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
        read
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/40"
      }`}
      aria-hidden
    >
      {read && <Check className="size-3" />}
    </span>
  )
}

function SidebarPanel({
  activeId,
  readIds,
  onNavigate,
}: {
  activeId: string
  readIds: string[]
  onNavigate?: () => void
}) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()

  const groups = useMemo(() => {
    if (!q) return DOC_GROUPS
    return DOC_GROUPS.map((g) => ({
      ...g,
      sections: g.sections.filter(
        (s) => s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q),
      ),
    })).filter((g) => g.sections.length > 0)
  }, [q])

  const progress = Math.round((readIds.length / DOC_SECTIONS.length) * 100)

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search document"
          className="h-9 pl-8"
          data-cy="docs-search"
        />
      </div>

      <div>
        <p className="text-sm font-semibold">Your progress</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{progress}%</span>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sections match “{query}”.</p>
      ) : (
        <nav className="space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-1 text-sm font-semibold">{group.label}</p>
              <div className="space-y-0.5">
                {group.sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={onNavigate}
                    className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      activeId === section.id
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <ReadCheckbox read={readIds.includes(section.id)} />
                    <span>{section.title}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </nav>
      )}
    </div>
  )
}

function copySectionLink(id: string) {
  const url = `${window.location.origin}/docs#${id}`
  navigator.clipboard
    .writeText(url)
    .then(() => toast.success("Link copied"))
    .catch(() => toast.error("Couldn't copy the link"))
}

export default function DocsPage() {
  const { user, isLoading } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [readIds, setReadIds] = useState<string[]>(loadReadIds)
  const activeId = useScrollSpy(SECTION_IDS)

  // Honour deep links (/docs#section) — on a fresh load the browser's own
  // anchor jump happens before React has rendered the target element.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id && SECTION_IDS.includes(id)) document.getElementById(id)?.scrollIntoView()
  }, [])

  // A section counts as read once the reader has scrolled to it.
  useEffect(() => {
    if (!activeId) return
    setReadIds((prev) => (prev.includes(activeId) ? prev : [...prev, activeId]))
  }, [activeId])

  useEffect(() => {
    try {
      localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(readIds))
    } catch {
      // Storage unavailable (private mode) — progress just won't persist.
    }
  }, [readIds])

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open contents">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Contents</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">
                <SidebarPanel
                  activeId={activeId}
                  readIds={readIds}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>

          <Link to="/docs" className="flex items-center gap-2.5">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FlaskConical className="size-4" />
            </div>
            <div className="leading-tight">
              <span className="block text-base font-semibold">
                Test<span className="text-primary">Mate</span>
              </span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                Documentation &amp; user guide
              </span>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {!isLoading && (
              <Button asChild size="sm">
                <Link to="/dashboard">{user ? "Go to app" : "Sign in"}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[90rem] gap-10 px-4">
        <aside className="sticky top-14 hidden max-h-[calc(100svh-3.5rem)] w-72 shrink-0 overflow-y-auto py-8 pr-1 lg:block">
          <SidebarPanel activeId={activeId} readIds={readIds} />
        </aside>

        <main className="min-w-0 max-w-3xl flex-1 py-10">
          <div className="mb-12">
            <h1 className="text-3xl font-bold tracking-tight">TestMate Documentation</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Everything you need to plan tests, execute runs, and track bugs, feature requests,
              and tickets with your team.
            </p>
          </div>

          <div className="space-y-14">
            {DOC_SECTIONS.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-20">
                <div className="mb-4 border-b pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
                      <section.icon className="size-5 text-primary" />
                      {section.title}
                    </h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      aria-label={`Copy link to ${section.title}`}
                      onClick={() => copySectionLink(section.id)}
                    >
                      <Link2 className="size-4" />
                    </Button>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{section.summary}</p>
                </div>
                {section.body}
              </section>
            ))}
          </div>

          <footer className="mt-16 border-t pt-6 pb-10 text-sm text-muted-foreground">
            TestMate — Simplified test planning, execution, and tracking.
          </footer>
        </main>

        <aside className="sticky top-14 hidden max-h-[calc(100svh-3.5rem)] w-60 shrink-0 py-8 xl:block">
          <p className="text-sm font-semibold">Quick Start</p>
          <ol className="mt-3 space-y-2">
            {QUICK_START.map((step, i) => (
              <li key={step.href}>
                <a
                  href={step.href}
                  className="flex items-start gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  {step.label}
                </a>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  )
}
