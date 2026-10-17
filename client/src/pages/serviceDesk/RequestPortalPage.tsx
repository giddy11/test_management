// pages/serviceDesk/RequestPortalPage.tsx — "What do you need?" The IT
// request catalog as tiles: pick a category, pick an item, fill its form.
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, ClipboardList, Search, ShieldCheck, Store } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CategoryIcon, ModuleOffNotice } from "@/components/serviceDesk/RequestBits"
import { usePortalCatalog, useServiceDeskSettings } from "@/hooks/useServiceDesk"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"
import type { PortalCategory, PortalItem } from "@/types/serviceDesk.types"

export default function RequestPortalPage() {
  const { permissions } = useAuth()
  const navigate = useNavigate()
  const { data: settings, isLoading: loadingSettings } = useServiceDeskSettings()
  const enabled = Boolean(settings?.enabled)
  const { data: catalog = [], isLoading } = usePortalCatalog(enabled)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const term = search.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!term) return []
    return catalog.flatMap((c) =>
      c.items
        .filter((i) => `${i.name} ${i.description ?? ""} ${c.name}`.toLowerCase().includes(term))
        .map((i) => ({ item: i, category: c }))
    )
  }, [catalog, term])
  const category = catalog.find((c) => c.id === categoryId) ?? null

  if (loadingSettings) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Store className="size-6 text-primary" /> What do you need?
          </h1>
          <p className="text-sm text-muted-foreground">
            Ask IT for software, hardware, accounts and access. You'll be told at every step.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/requests/mine">
            <ClipboardList className="mr-1 size-3.5" /> My requests
          </Link>
        </Button>
      </div>

      {!enabled ? (
        <ModuleOffNotice canManage={can(permissions, "servicedesk.manage")} />
      ) : (
        <>
          <div className="relative max-w-xl">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search, e.g. laptop, Adobe, VPN"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-cy="portal-search"
            />
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading the catalog…</p>}

          {term ? (
            <section className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {matches.length ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "Nothing matches. Try 'Something else' under IT solutions."}
              </p>
              <ItemGrid entries={matches} onPick={(i) => navigate(`/requests/new/${i.id}`)} />
            </section>
          ) : category ? (
            <section className="space-y-3">
              <Button variant="ghost" size="sm" onClick={() => setCategoryId(null)}>
                <ArrowLeft className="mr-1 size-3.5" /> All categories
              </Button>
              <div className="flex items-center gap-2">
                <CategoryIcon name={category.icon} className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">{category.name}</h2>
              </div>
              {category.description && <p className="text-sm text-muted-foreground">{category.description}</p>}
              <ItemGrid
                entries={category.items.map((item) => ({ item, category }))}
                onPick={(i) => navigate(`/requests/new/${i.id}`)}
              />
            </section>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {catalog.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => (c.items.length === 1 ? navigate(`/requests/new/${c.items[0].id}`) : setCategoryId(c.id))}
                  className="text-left"
                  data-cy={`portal-category-${c.key}`}
                >
                  <Card className="h-full transition-colors hover:border-primary/60 hover:bg-accent/40">
                    <CardHeader>
                      <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CategoryIcon name={c.icon} className="size-5" />
                      </div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      {c.description && <CardDescription>{c.description}</CardDescription>}
                    </CardHeader>
                  </Card>
                </button>
              ))}
              {!isLoading && catalog.length === 0 && (
                <Card className="border-dashed sm:col-span-2 lg:col-span-4">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    The catalog is empty. Ask your administrator to add what people can request.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ItemGrid({
  entries,
  onPick,
}: {
  entries: { item: PortalItem; category: PortalCategory }[]
  onPick: (item: PortalItem) => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {entries.map(({ item, category }) => (
        <Card key={item.id} className="flex flex-col">
          <CardHeader className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{item.name}</CardTitle>
              {item.needsApproval && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <ShieldCheck className="size-3" /> Needs approval
                </Badge>
              )}
            </div>
            <CardDescription>{item.description ?? category.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={() => onPick(item)} data-cy="portal-request-item">
              Request this
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
