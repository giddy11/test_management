// components/ai/AiFeatureModels.tsx — optionally pin individual AI features to
// a provider and model among the scope's saved keys. Unpinned features use the
// key in use. Saved as soon as a model is picked.
import { useState } from "react"
import { toast } from "sonner"
import { SlidersHorizontal } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError } from "@/transport/http"
import { useAiKeyModels, useAiKeys, useSetAiFeatureModel } from "@/hooks/useAi"
import {
  AI_FEATURES,
  providerLabel,
  type AiCredential,
  type AiFeature,
  type AiKeyScope,
  type AiProviderId,
} from "@/types/ai.types"
import { modelOptionLabel } from "./modelLabels"

const DEFAULT = "__default__"

export function AiFeatureModels({ scope }: { scope: AiKeyScope }) {
  const { data } = useAiKeys(scope)
  const keys = data?.keys ?? []
  // Only worth showing once there is a choice to make.
  if (keys.length === 0) return null
  const active = keys.find((k) => k.isActive) ?? null

  return (
    <Card data-cy={`ai-feature-models-${scope}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          Model for each feature
        </CardTitle>
        <CardDescription>
          Optional. Choose a different saved key or model for a feature; anything left on default uses the
          key in use{active ? ` (${active.providerLabel} · ${active.model})` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {AI_FEATURES.map((feature) => (
          <FeatureRow key={feature.id} scope={scope} feature={feature.id} label={feature.label} description={feature.description} keys={keys} active={active} />
        ))}
      </CardContent>
    </Card>
  )
}

interface FeatureRowProps {
  scope: AiKeyScope
  feature: AiFeature
  label: string
  description: string
  keys: AiCredential[]
  active: AiCredential | null
}

function FeatureRow({ scope, feature, label, description, keys, active }: FeatureRowProps) {
  const pinned = keys.find((k) => k.featureModels?.[feature])
  // The provider picked in this row; a model must follow before it's saved.
  const [chosen, setChosen] = useState<AiProviderId | null>(null)
  const provider = chosen ?? pinned?.provider ?? null
  const setModel = useSetAiFeatureModel(scope)
  const models = useAiKeyModels(scope, provider, provider !== null)
  const currentModel = provider && pinned?.provider === provider ? pinned.featureModels[feature] : undefined

  const save = (target: { provider: AiProviderId; model: string } | null) =>
    setModel.mutate(
      { feature, target },
      {
        onSuccess: () => {
          setChosen(null)
          toast.success(target ? `${label} now use ${target.model}` : `${label} use the key in use`)
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the model"),
      }
    )

  const options = models.data ?? []
  const withCurrent = currentModel && !options.some((m) => m.id === currentModel) ? [{ id: currentModel, label: currentModel }, ...options] : options

  return (
    <div className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0" data-cy={`ai-feature-${feature}`}>
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Select
        value={provider ?? DEFAULT}
        onValueChange={(v) => {
          if (v === DEFAULT) {
            setChosen(null)
            if (pinned) save(null)
          } else {
            setChosen(v as AiProviderId)
          }
        }}
        disabled={setModel.isPending}
      >
        <SelectTrigger className="w-52" aria-label={`Provider for ${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT}>Default{active ? ` (${active.providerLabel})` : ""}</SelectItem>
          {keys.map((k) => (
            <SelectItem key={k.provider} value={k.provider}>
              {providerLabel(k.provider)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {provider && (
        <div className="grid gap-1">
          <Select
            value={currentModel}
            onValueChange={(model) => save({ provider, model })}
            disabled={setModel.isPending || models.isLoading}
          >
            <SelectTrigger className="w-64" aria-label={`Model for ${label}`}>
              <SelectValue placeholder={models.isLoading ? "Loading models…" : "Choose a model"} />
            </SelectTrigger>
            <SelectContent>
              {withCurrent.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {modelOptionLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {models.error && (
            <p className="max-w-64 text-xs text-destructive">
              {models.error instanceof ApiError ? models.error.message : "Couldn't load the models"}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
