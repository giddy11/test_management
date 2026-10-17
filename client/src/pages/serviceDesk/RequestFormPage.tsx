// pages/serviceDesk/RequestFormPage.tsx — fill in a catalog item's form.
// /requests/new/:itemId starts a request; /requests/:id/edit continues a
// draft. "Save draft" keeps it to yourself; "Submit" sends it for approval
// (if the item needs it) or straight to IT.
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DynamicFormFields } from "@/components/serviceDesk/DynamicFormFields"
import { RequestedForField } from "@/components/serviceDesk/RequestedForField"
import { formFieldErrors, requestedForPayload, type RequestedFor } from "@/lib/serviceDesk"
import { CategoryIcon, ModuleOffNotice } from "@/components/serviceDesk/RequestBits"
import { FilePicker } from "@/components/serviceDesk/RequestFiles"
import {
  useCreateRequest,
  usePortalCatalog,
  useServiceDeskSettings,
  useServiceRequest,
  useSubmitRequest,
  useUpdateDraft,
  useUploadRequestFiles,
} from "@/hooks/useServiceDesk"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"
import { ApiError } from "@/transport/http"
import {
  PRIORITY_META,
  REQUEST_PRIORITIES,
  type FormValue,
  type FormValues,
  type RequestPriority,
} from "@/types/serviceDesk.types"

export default function RequestFormPage() {
  const { itemId: newItemId, id: draftId } = useParams()
  const navigate = useNavigate()
  const { user, permissions } = useAuth()
  const { data: settings, isLoading: loadingSettings } = useServiceDeskSettings()
  const enabled = Boolean(settings?.enabled)
  const { data: catalog = [], isLoading: loadingCatalog } = usePortalCatalog(enabled)
  const { data: draft, isLoading: loadingDraft } = useServiceRequest(draftId)

  const itemId = newItemId ?? draft?.request.catalogItemId ?? undefined
  const found = useMemo(() => {
    for (const c of catalog) {
      const item = c.items.find((i) => i.id === itemId)
      if (item) return { item, category: c }
    }
    return null
  }, [catalog, itemId])

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [justification, setJustification] = useState("")
  const [priority, setPriority] = useState<RequestPriority>("medium")
  const [values, setValues] = useState<FormValues>({})
  const [requestedFor, setRequestedFor] = useState<RequestedFor>({ mode: "me" })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hydrated, setHydrated] = useState(false)

  // Start from the draft (when editing) or the item's name (when new).
  useEffect(() => {
    if (hydrated) return
    if (draftId && draft) {
      const r = draft.request
      setTitle(r.title)
      setDescription(r.description ?? "")
      setJustification(r.businessJustification ?? "")
      setPriority(r.priority)
      setValues(r.formValues ?? {})
      setRequestedFor(
        r.requestedFor?.id
          ? { mode: "colleague", person: { id: r.requestedFor.id, name: r.requestedFor.name, email: r.requestedFor.email ?? "" } }
          : r.requestedFor
            ? { mode: "new", name: r.requestedFor.name, email: r.requestedFor.email ?? "" }
            : { mode: "me" }
      )
      setHydrated(true)
    } else if (!draftId && found) {
      setTitle(found.item.name)
      setHydrated(true)
    }
  }, [draftId, draft, found, hydrated])

  const create = useCreateRequest()
  const update = useUpdateDraft()
  const submit = useSubmitRequest()
  const upload = useUploadRequestFiles()
  const [files, setFiles] = useState<File[]>([])
  const busy = create.isPending || update.isPending || submit.isPending || upload.isPending

  const setValue = (key: string, value: FormValue | undefined) => {
    setValues((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // The required-field check the server will make anyway, so the person sees
  // every gap at once instead of one round trip at a time.
  const localErrors = (): Record<string, string> => {
    const out: Record<string, string> = {}
    if (!title.trim()) out.title = "Give the request a short title"
    for (const f of found?.item.formSchema ?? []) {
      const v = values[f.key]
      const blank = v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
      if (f.required && blank) out[f.key] = `${f.label} is required`
    }
    if (requestedFor.mode === "colleague" && !requestedFor.person) out.requestedFor = "Pick a colleague, or choose Me"
    if (requestedFor.mode === "new" && !requestedFor.name.trim()) out.requestedFor = "Give the new starter's name"
    return out
  }

  const showError = (e: unknown) => {
    if (e instanceof ApiError) {
      const fieldErrors = formFieldErrors(e.errors)
      for (const err of e.errors) {
        if (err.field === "title") fieldErrors.title = err.message
        if (err.field.startsWith("requestedFor")) fieldErrors.requestedFor = err.message
      }
      setErrors(fieldErrors)
      toast.error(e.message)
    } else {
      toast.error("Something went wrong")
    }
  }

  const payload = () => ({
    title: title.trim(),
    description: description.trim() || null,
    businessJustification: justification.trim() || null,
    priority,
    formValues: values,
    ...requestedForPayload(requestedFor),
  })

  const save = async (andSubmit: boolean) => {
    if (!found) return
    if (andSubmit) {
      const local = localErrors()
      if (Object.keys(local).length) {
        setErrors(local)
        toast.error("Some answers need another look")
        return
      }
    }
    // With files, the request is saved as a draft first and submitted only once
    // they're uploaded — so approvers never see it without its attachments.
    let savedId = draftId ?? null
    try {
      let reference = ""
      if (draftId) {
        await update.mutateAsync({ id: draftId, catalogItemId: found.item.id, ...payload() })
      } else {
        const saved = await create.mutateAsync({
          catalogItemId: found.item.id,
          ...payload(),
          submit: andSubmit && files.length === 0,
        })
        savedId = saved.id
        reference = saved.reference
      }
      if (files.length && savedId) {
        try {
          await upload.mutateAsync({ id: savedId, files })
        } catch (e) {
          toast.error(`Saved as a draft, but the files couldn't be uploaded${e instanceof ApiError ? `: ${e.message}` : ""}`)
          navigate(`/requests/${savedId}`)
          return
        }
      }
      if (andSubmit && savedId && (draftId || files.length)) await submit.mutateAsync(savedId)
      const ref = reference ? ` ${reference}` : ""
      toast.success(andSubmit ? `Request${ref} submitted` : `Draft${ref} saved`)
      navigate(`/requests/${savedId}`)
    } catch (e) {
      showError(e)
      // Created but not submitted (e.g. no approver yet) — it's safe as a draft.
      if (!draftId && savedId) navigate(`/requests/${savedId}/edit`)
    }
  }

  if (loadingSettings || loadingCatalog || (draftId && loadingDraft)) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (!enabled) return <ModuleOffNotice canManage={can(permissions, "servicedesk.manage")} />
  if (draftId && draft && !draft.viewer.canEdit) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          This request has been submitted and can no longer be edited.{" "}
          <Link className="underline" to={`/requests/${draftId}`}>View it</Link>
        </CardContent>
      </Card>
    )
  }
  if (!found) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          That item is no longer in the catalog. <Link className="underline" to="/requests">Back to the catalog</Link>
        </CardContent>
      </Card>
    )
  }

  const { item, category } = found
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to={draftId ? `/requests/${draftId}` : "/requests"}>
          <ArrowLeft className="mr-1 size-3.5" /> {draftId ? "Back to the request" : "Back to the catalog"}
        </Link>
      </Button>

      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CategoryIcon name={category.icon} className="size-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{category.name}</p>
          <h1 className="text-2xl font-semibold">{item.name}</h1>
          {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
          {item.needsApproval && (
            <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <ShieldCheck className="size-3.5" /> This needs approval before IT can start.
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your request</CardTitle>
          <CardDescription>Fields marked * are required to submit. You can save a draft any time.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-1.5">
            <Label htmlFor="sr-title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="sr-title"
              value={title}
              maxLength={200}
              aria-invalid={Boolean(errors.title)}
              onChange={(e) => {
                setTitle(e.target.value)
                setErrors((p) => ({ ...p, title: "" }))
              }}
              data-cy="request-title"
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <RequestedForField value={requestedFor} onChange={setRequestedFor} myId={user?.id} error={errors.requestedFor} />

          <DynamicFormFields fields={item.formSchema} values={values} onChange={setValue} errors={errors} disabled={busy} />

          <div className="grid gap-1.5">
            <Label htmlFor="sr-description">Anything else IT should know?</Label>
            <Textarea id="sr-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sr-justification">Business justification</Label>
            <Textarea
              id="sr-justification"
              rows={3}
              placeholder={item.needsApproval ? "Why you need it — your approver will read this" : "Why you need it (optional)"}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>

          <FilePicker files={files} onChange={setFiles} disabled={busy} />
          {draftId && (draft?.attachments.length ?? 0) > 0 && (
            <p className="-mt-3 text-xs text-muted-foreground">
              Already attached: {draft?.attachments.map((a) => a.fileName).join(", ")}
            </p>
          )}

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as RequestPriority)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REQUEST_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="outline" disabled={busy} onClick={() => save(false)} data-cy="request-save-draft">
              Save draft
            </Button>
            <Button disabled={busy} onClick={() => save(true)} data-cy="request-submit">
              {item.needsApproval ? "Submit for approval" : "Submit to IT"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
