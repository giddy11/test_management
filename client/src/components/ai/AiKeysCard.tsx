// components/ai/AiKeysCard.tsx — saved AI provider keys for one scope:
// the organisation's ("org", ai.managekeys) or the signed-in user's ("own").
//
// A key is checked with the provider before it is saved (the server does it
// again), and the API only ever returns its last four characters.
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, KeyRound, Pencil, Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PasswordField } from "@/components/shared/PasswordField"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Spinner } from "@/components/shared/Spinner"
import { ApiError } from "@/transport/http"
import {
  useActivateAiKey,
  useAiKeyModels,
  useAiKeys,
  useCheckAiKey,
  useRemoveAiKey,
  useSaveAiKey,
} from "@/hooks/useAi"
import {
  AI_PROVIDERS,
  OLLAMA_CLOUD,
  providerLabel,
  type AiCredential,
  type AiKeyScope,
  type AiModelInfo,
  type AiProviderId,
} from "@/types/ai.types"
import { ModelGuide } from "./ModelGuide"
import { modelOptionLabel } from "./modelLabels"
import { fieldErrors } from "./aiErrors"

interface AiKeysCardProps {
  scope: AiKeyScope
  title: string
  description: string
}

export function AiKeysCard({ scope, title, description }: AiKeysCardProps) {
  const { data, isLoading, error } = useAiKeys(scope)
  const activate = useActivateAiKey(scope)
  const remove = useRemoveAiKey(scope)
  // null = closed; "new" = adding; a credential = changing that key.
  const [editing, setEditing] = useState<AiCredential | "new" | null>(null)
  const [removing, setRemoving] = useState<AiCredential | null>(null)

  const keys = data?.keys ?? []
  const storageReady = data?.storageReady ?? true
  const unusedProviders = AI_PROVIDERS.filter((p) => !keys.some((k) => k.provider === p.id))

  const onActivate = (key: AiCredential) =>
    activate.mutate(key.provider, {
      onSuccess: () => toast.success(`AI now uses the ${key.providerLabel} key`),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't switch keys"),
    })

  const onRemove = () => {
    if (!removing) return
    remove.mutate(removing.provider, {
      onSuccess: () => {
        toast.success(`${removing.providerLabel} key removed`)
        setRemoving(null)
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't remove the key"),
    })
  }

  return (
    <Card data-cy={`ai-keys-${scope}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!storageReady && (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" data-cy="ai-storage-not-ready">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p>
              Keys can't be saved yet: the server has no <code>AI_KEYS_SECRET</code> set, which is used to
              encrypt them. Ask whoever runs TestMate to add it.
            </p>
          </div>
        )}

        {isLoading ? (
          <Spinner />
        ) : error ? (
          <p className="text-sm text-destructive">{error instanceof ApiError ? error.message : "Couldn't load the keys"}</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No key saved yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {keys.map((key) => (
              <li key={key.provider} className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-cy={`ai-key-${key.provider}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {key.providerLabel}
                    {key.isActive && <Badge data-cy="ai-key-in-use">In use</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Key ending in <span className="font-mono">{key.keyLast4 || "—"}</span> · {key.model}
                    {key.baseUrl && key.baseUrl !== OLLAMA_CLOUD ? ` · ${key.baseUrl}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {!key.isActive && (
                    <Button size="sm" variant="outline" onClick={() => onActivate(key)} disabled={activate.isPending}>
                      Use this
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(key)} aria-label={`Change the ${key.providerLabel} key`}>
                    <Pencil className="size-4" /> Change
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(key)} aria-label={`Remove the ${key.providerLabel} key`}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing ? (
          <KeyEditor
            key={editing === "new" ? "new" : editing.provider}
            scope={scope}
            existing={editing === "new" ? null : editing}
            availableProviders={editing === "new" ? unusedProviders.map((p) => p.id) : []}
            isFirstKey={keys.length === 0}
            onDone={() => setEditing(null)}
          />
        ) : (
          unusedProviders.length > 0 && (
            <Button variant="outline" onClick={() => setEditing("new")} disabled={!storageReady} data-cy={`ai-add-key-${scope}`}>
              <Plus className="size-4" /> Add a key
            </Button>
          )
        )}
      </CardContent>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove the ${removing?.providerLabel ?? ""} key?`}
        description={
          removing?.isActive
            ? "This is the key in use. AI will switch to another saved key if there is one, otherwise AI stops until a key is added."
            : "The key is deleted from TestMate. You can add it again later."
        }
        confirmLabel="Remove key"
        loading={remove.isPending}
        onConfirm={onRemove}
      />
    </Card>
  )
}

// ── Add / change one key ──────────────────────────────────────────────────────

interface KeyEditorProps {
  scope: AiKeyScope
  existing: AiCredential | null
  availableProviders: AiProviderId[]
  isFirstKey: boolean
  onDone: () => void
}

function KeyEditor({ scope, existing, availableProviders, isFirstKey, onDone }: KeyEditorProps) {
  const [provider, setProvider] = useState<AiProviderId | null>(existing?.provider ?? availableProviders[0] ?? null)
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "")
  const [model, setModel] = useState(existing?.model ?? "")
  const [makeActive, setMakeActive] = useState(false)
  // Models for a typed key (from the check), or for the saved key (on request).
  const [checkedModels, setCheckedModels] = useState<AiModelInfo[] | null>(null)
  const [loadSaved, setLoadSaved] = useState(false)

  const check = useCheckAiKey(scope)
  const save = useSaveAiKey(scope)
  const savedModels = useAiKeyModels(scope, existing?.provider ?? null, loadSaved && !apiKey)

  const isOllama = provider === "ollama"
  const models = checkedModels ?? (loadSaved && !apiKey ? savedModels.data ?? null : null)
  const modelOptions = useMemo(() => {
    const list = models ?? []
    // Keep the current model selectable even if the provider no longer lists it.
    return model && !list.some((m) => m.id === model) ? [{ id: model, label: model }, ...list] : list
  }, [models, model])

  const checkError = fieldErrors(check.error ?? (loadSaved && !apiKey ? savedModels.error : null))
  const saveError = fieldErrors(save.error)
  const errorFor = (field: string) => saveError.fields[field] ?? checkError.fields[field]

  // A changed key or address needs a fresh check before its models are trusted.
  const resetCheck = () => {
    setCheckedModels(null)
    check.reset()
    save.reset()
  }

  const onCheck = () => {
    if (!provider) return
    if (!apiKey && existing) {
      setLoadSaved(true)
      return
    }
    check.mutate(
      { provider, apiKey, baseUrl: isOllama ? baseUrl.trim() || null : null },
      {
        onSuccess: (list) => {
          setCheckedModels(list)
          if (!list.some((m) => m.id === model)) setModel(list[0]?.id ?? "")
        },
      }
    )
  }

  const onSave = () => {
    if (!provider || !model) return
    save.mutate(
      {
        provider,
        model,
        ...(apiKey ? { apiKey } : {}),
        ...(isOllama ? { baseUrl: baseUrl.trim() || null } : {}),
        ...(makeActive ? { makeActive: true } : {}),
      },
      {
        onSuccess: () => {
          toast.success(existing ? `${providerLabel(provider)} key updated` : `${providerLabel(provider)} key saved`)
          onDone()
        },
      }
    )
  }

  const canCheck = !!provider && (!!apiKey || !!existing || isOllama) && !check.isPending
  // A new key must be checked first; a changed key needs a re-check.
  const canSave = !!provider && !!model && !save.isPending && (apiKey ? checkedModels !== null : !!existing || isOllama)

  return (
    <div className="space-y-4 rounded-md border p-4" data-cy="ai-key-editor">
      <p className="text-sm font-medium">{existing ? `Change the ${existing.providerLabel} key` : "Add a key"}</p>

      <div className="grid gap-1.5">
        <Label htmlFor={`ai-provider-${scope}`}>Provider</Label>
        <Select
          value={provider ?? undefined}
          onValueChange={(v) => {
            setProvider(v as AiProviderId)
            setModel("")
            resetCheck()
          }}
          disabled={!!existing}
        >
          <SelectTrigger id={`ai-provider-${scope}`} className="w-60" data-cy="ai-provider-select">
            <SelectValue placeholder="Choose a provider" />
          </SelectTrigger>
          <SelectContent>
            {(existing ? [existing.provider] : availableProviders).map((id) => (
              <SelectItem key={id} value={id}>
                {providerLabel(id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isOllama && (
        <div className="grid gap-1.5">
          <Label htmlFor={`ai-base-url-${scope}`}>Server address</Label>
          <Input
            id={`ai-base-url-${scope}`}
            value={baseUrl}
            placeholder={OLLAMA_CLOUD}
            onChange={(e) => {
              setBaseUrl(e.target.value)
              resetCheck()
            }}
            aria-invalid={Boolean(errorFor("baseUrl"))}
            data-cy="ai-base-url"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank for Ollama Cloud, and use an API key from your ollama.com account. For your own Ollama
            server, enter its public https address and, if it needs one, its access token.
          </p>
          {errorFor("baseUrl") && <p className="text-xs text-destructive">{errorFor("baseUrl")}</p>}
        </div>
      )}

      <PasswordField
        id={`ai-api-key-${scope}`}
        label={isOllama ? "API key (leave blank if your server has none)" : "API key"}
        value={apiKey}
        autoComplete="off"
        placeholder={existing ? `Leave blank to keep the key ending in ${existing.keyLast4}` : "Paste the key"}
        onChange={(e) => {
          setApiKey(e.target.value)
          setLoadSaved(false)
          resetCheck()
        }}
        error={errorFor("apiKey")}
        data-cy="ai-api-key"
      />

      <div>
        <Button variant="outline" onClick={onCheck} disabled={!canCheck} data-cy="ai-check-key">
          {check.isPending || (loadSaved && savedModels.isFetching) ? "Checking…" : apiKey || !existing ? "Check key and load models" : "Load models"}
        </Button>
        {checkedModels && <p className="mt-1.5 text-xs text-green-600">Key accepted — {checkedModels.length} models available.</p>}
        {checkError.general && <p className="mt-1.5 text-xs text-destructive">{checkError.general}</p>}
      </div>

      {modelOptions.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor={`ai-model-${scope}`}>Model</Label>
          <Select value={model || undefined} onValueChange={setModel}>
            <SelectTrigger id={`ai-model-${scope}`} className="w-full sm:w-96" data-cy="ai-model-select">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {modelOptionLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errorFor("model") && <p className="text-xs text-destructive">{errorFor("model")}</p>}
          <ModelGuide />
        </div>
      )}

      {!isFirstKey && !existing?.isActive && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={makeActive} onCheckedChange={(v) => setMakeActive(v === true)} data-cy="ai-make-active" />
          Make this the key in use
        </label>
      )}

      {saveError.general && <p className="text-sm text-destructive">{saveError.general}</p>}

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={!canSave} data-cy="ai-save-key">
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
