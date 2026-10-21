// pages/serviceDesk/CatalogSetupPage.tsx — servicedesk.manage only. Turn IT
// requests on or off for the organisation, and shape the catalog: the
// categories, the items in each, their forms and who approves them. The
// eight starter categories are created the first time this page opens.
import { useState } from "react"
import { Eye, EyeOff, Pencil, Plus, Power, Settings2, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Spinner } from "@/components/shared/Spinner"
import { CategoryIcon } from "@/components/serviceDesk/RequestBits"
import { CATEGORY_ICON_CHOICES } from "@/lib/serviceDesk"
import { ItemEditorDialog } from "@/components/serviceDesk/ItemEditorDialog"
import { ApproverGroupsTab } from "@/components/serviceDesk/setup/ApproverGroupsTab"
import { ApprovalPoliciesTab } from "@/components/serviceDesk/setup/ApprovalPoliciesTab"
import { LineManagersTab } from "@/components/serviceDesk/setup/LineManagersTab"
import { ServiceLevelsTab } from "@/components/serviceDesk/setup/ServiceLevelsTab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSearchParams } from "react-router-dom"
import {
  useAdminCatalog,
  useCreateCategory,
  useServiceDeskSettings,
  useDeleteCategory,
  useDeleteItem,
  useUpdateCategory,
  useUpdateItem,
  useUpdateServiceDeskSettings,
} from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"
import { cn } from "@/lib/utils"
import type { AdminCategory, AdminItem } from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

export default function CatalogSetupPage() {
  const { data: settings } = useServiceDeskSettings()
  const { data: catalog = [], isLoading } = useAdminCatalog()
  const toggle = useUpdateServiceDeskSettings()
  const updateItem = useUpdateItem()
  const updateCategory = useUpdateCategory()
  const [confirmToggle, setConfirmToggle] = useState(false)
  const [editingItem, setEditingItem] = useState<{ item: AdminItem | null; categoryId?: string } | null>(null)
  const [editingCategory, setEditingCategory] = useState<AdminCategory | "new" | null>(null)
  const [deleting, setDeleting] = useState<{ kind: "category" | "item"; id: string; name: string; itemCount?: number } | null>(null)
  const deleteCategory = useDeleteCategory()
  const deleteItem = useDeleteItem()
  const enabled = Boolean(settings?.enabled)
  // The tab lives in the URL (?tab=policies) so a link can open it directly.
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") ?? "catalog"
  const setTab = (t: string) => setParams(t === "catalog" ? {} : { tab: t }, { replace: true })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Settings2 className="size-6 text-primary" /> Catalog setup
          </h1>
          <p className="text-sm text-muted-foreground">What people can ask IT for, the questions each asks, who approves it, and how fast.</p>
        </div>
      </div>

      <Card className={cn(enabled ? "border-emerald-300 dark:border-emerald-900" : "border-amber-300 dark:border-amber-900")}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <Power className={cn("size-5", enabled ? "text-emerald-600" : "text-amber-600")} />
            <div>
              <p className="font-medium">IT requests is {enabled ? "on" : "off"}</p>
              <p className="text-sm text-muted-foreground">
                {enabled
                  ? "Everyone who can submit IT requests sees the portal in their sidebar."
                  : "Only people who can set up IT requests see it. Get the catalog ready, then turn it on."}
              </p>
            </div>
          </div>
          <Button variant={enabled ? "outline" : "default"} disabled={toggle.isPending} onClick={() => setConfirmToggle(true)} data-cy="toggle-service-desk">
            {enabled ? "Turn off" : "Turn on"}
          </Button>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="groups">Approver groups</TabsTrigger>
          <TabsTrigger value="policies">Approval policies</TabsTrigger>
          <TabsTrigger value="managers">Line managers</TabsTrigger>
          <TabsTrigger value="levels">Service levels</TabsTrigger>
        </TabsList>
        <TabsContent value="groups" className="pt-2"><ApproverGroupsTab /></TabsContent>
        <TabsContent value="policies" className="pt-2"><ApprovalPoliciesTab /></TabsContent>
        <TabsContent value="managers" className="pt-2"><LineManagersTab /></TabsContent>
        <TabsContent value="levels" className="pt-2"><ServiceLevelsTab /></TabsContent>
        <TabsContent value="catalog" className="space-y-4 pt-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setEditingCategory("new")}>
          <Plus className="mr-1 size-3.5" /> Add category
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading the catalog…</p>}

      {catalog.map((c) => (
        <Card key={c.id} className={cn(!c.isActive && "opacity-70")}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CategoryIcon name={c.icon} className="size-4" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {c.name}
                  {!c.isActive && <Badge variant="outline">Hidden</Badge>}
                </CardTitle>
                {c.description && <CardDescription>{c.description}</CardDescription>}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditingCategory(c)}>
                <Pencil className="mr-1 size-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={updateCategory.isPending && updateCategory.variables?.id === c.id}
                onClick={() =>
                  updateCategory.mutate(
                    { id: c.id, isActive: !c.isActive },
                    { onSuccess: () => toast.success(c.isActive ? "Category hidden" : "Category shown"), onError: fail }
                  )
                }
              >
                {updateCategory.isPending && updateCategory.variables?.id === c.id ? (
                  <Spinner className="mr-1 size-3.5" />
                ) : c.isActive ? (
                  <EyeOff className="mr-1 size-3.5" />
                ) : (
                  <Eye className="mr-1 size-3.5" />
                )}
                {c.isActive ? "Hide" : "Show"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingItem({ item: null, categoryId: c.id })}>
                <Plus className="mr-1 size-3.5" /> Item
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${c.name}`}
                title="Delete (only if nothing in it was ever requested)"
                onClick={() => setDeleting({ kind: "category", id: c.id, name: c.name, itemCount: c.items.length })}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {c.items.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
            {c.items.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {i.name}
                    {!i.isActive && <Badge variant="outline">Hidden</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {i.formSchema.length} question{i.formSchema.length === 1 ? "" : "s"} ·{" "}
                    {i.approvalMode === "none" ? (
                      "no approval"
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="size-3" />
                        {i.approvalMode === "policy"
                          ? `follows "${i.approvalPolicyName ?? "a missing policy"}"`
                          : i.approvers.length
                            ? `approved by ${i.approvers.map((a) => a.name).join(", ")}`
                            : "approved by IT request administrators (no one named)"}
                      </span>
                    )}
                    {i.riskLevel !== "low" && <> · {i.riskLevel} risk</>}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={updateItem.isPending && updateItem.variables?.id === i.id}
                  onClick={() =>
                    updateItem.mutate(
                      { id: i.id, isActive: !i.isActive },
                      { onSuccess: () => toast.success(i.isActive ? "Item hidden" : "Item shown"), onError: fail }
                    )
                  }
                >
                  {updateItem.isPending && updateItem.variables?.id === i.id && <Spinner className="mr-1 size-3.5" />}
                  {i.isActive ? "Hide" : "Show"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingItem({ item: i })}>
                  <Pencil className="mr-1 size-3.5" /> Edit
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${i.name}`}
                  title="Delete (only if it was never requested)"
                  onClick={() => setDeleting({ kind: "item", id: i.id, name: i.name })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description={
          deleting?.kind === "category"
            ? `This permanently deletes the category${deleting.itemCount ? ` and its ${deleting.itemCount} item${deleting.itemCount === 1 ? "" : "s"}` : ""}. It's only allowed if nothing in it was ever requested — otherwise, hide it instead.`
            : "This permanently deletes the item and its form. It's only allowed if nobody ever requested it — otherwise, hide it instead."
        }
        confirmLabel="Delete"
        loading={deleteCategory.isPending || deleteItem.isPending}
        onConfirm={() => {
          if (!deleting) return
          const done = {
            onSuccess: () => toast.success(`"${deleting.name}" deleted`),
            onError: fail,
            onSettled: () => setDeleting(null),
          }
          if (deleting.kind === "category") deleteCategory.mutate(deleting.id, done)
          else deleteItem.mutate(deleting.id, done)
        }}
      />

      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        title={enabled ? "Turn IT requests off?" : "Turn IT requests on?"}
        description={
          enabled
            ? "People won't be able to submit or follow requests until it's back on. Nothing is deleted."
            : "Everyone who can submit IT requests will see the request portal in their sidebar."
        }
        confirmLabel={enabled ? "Turn off" : "Turn on"}
        loading={toggle.isPending}
        onConfirm={() =>
          toggle.mutate(!enabled, {
            onSuccess: () => {
              toast.success(enabled ? "IT requests turned off" : "IT requests turned on")
              setConfirmToggle(false)
            },
            onError: fail,
          })
        }
      />

      <ItemEditorDialog
        open={editingItem !== null}
        onOpenChange={(o) => !o && setEditingItem(null)}
        categories={catalog}
        item={editingItem?.item ?? null}
        defaultCategoryId={editingItem?.categoryId}
      />

      <CategoryDialog category={editingCategory} onClose={() => setEditingCategory(null)} />
    </div>
  )
}

function CategoryDialog({ category, onClose }: { category: AdminCategory | "new" | null; onClose: () => void }) {
  const isNew = category === "new"
  const existing = category && category !== "new" ? category : null
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("lightbulb")
  const [openedFor, setOpenedFor] = useState<AdminCategory | "new" | null>(null)

  // Reset the fields each time the dialog opens for a different category.
  if (category !== openedFor) {
    setOpenedFor(category)
    setName(existing?.name ?? "")
    setDescription(existing?.description ?? "")
    setIcon(existing?.icon ?? "lightbulb")
  }

  const save = () => {
    if (!name.trim()) return toast.error("Give the category a name")
    const payload = { name: name.trim(), description: description.trim() || null, icon }
    const done = { onSuccess: () => { toast.success(isNew ? "Category added" : "Category saved"); onClose() }, onError: fail }
    if (existing) update.mutate({ id: existing.id, ...payload }, done)
    else create.mutate(payload, done)
  }

  return (
    <Dialog open={category !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a category" : `Edit "${existing?.name}"`}</DialogTitle>
          <DialogDescription>A tile on the request portal that groups related items.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cat-description">Description</Label>
            <Textarea id="cat-description" rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_ICON_CHOICES.map((i) => (
                  <SelectItem key={i} value={i}>
                    <span className="flex items-center gap-2"><CategoryIcon name={i} className="size-4" /> {i.replace(/-/g, " ")}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={create.isPending || update.isPending}>{isNew ? "Add" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
