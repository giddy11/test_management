// components/ai/AiSettingsTab.tsx — Settings → AI. Each section shows only
// for those who hold its permission (the API enforces the same):
//   ai.managekeys     the organisation's keys + per-feature models + usage report
//   ai.ownkey         my own keys + per-feature models
//   ai.use            my credits
//   ai.managecredits  prices and everyone's balances
import { Sparkles } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/contexts/AuthContext"
import { useAiStatus } from "@/hooks/useAi"
import { AiKeysCard } from "./AiKeysCard"
import { AiFeatureModels } from "./AiFeatureModels"
import { AiCreditsCard } from "./AiCreditsCard"
import { AiCreditsAdminCard } from "./AiCreditsAdminCard"
import { AiUsageCard } from "./AiUsageCard"

export function AiSettingsTab() {
  const { can } = useAuth()
  const canUse = can("ai.use")
  const canOrgKeys = can("ai.managekeys")
  const canOwnKeys = can("ai.ownkey")
  const canManageCredits = can("ai.managecredits")

  return (
    <div className="space-y-6" data-cy="ai-settings">
      {canUse && <AiStatusCard />}

      {canOrgKeys && (
        <section className="space-y-4">
          <AiKeysCard
            scope="org"
            title="Organisation AI keys"
            description="Used by everyone in the organisation who hasn't added a key of their own. Requests are billed to the organisation's account with the provider."
          />
          <AiFeatureModels scope="org" />
          <AiUsageCard />
        </section>
      )}

      {canOwnKeys && (
        <section className="space-y-4">
          <AiKeysCard
            scope="own"
            title="My own AI key"
            description="Optional. If you add one, your AI requests use it instead of the organisation's key, billed to your own account with the provider. Only you can use it."
          />
          <AiFeatureModels scope="own" />
        </section>
      )}

      {canUse && <AiCreditsCard />}
      {canManageCredits && <AiCreditsAdminCard />}
    </div>
  )
}

// Which key and model AI would use for this person right now.
function AiStatusCard() {
  const { data } = useAiStatus()
  if (!data) return null
  return (
    <Card data-cy="ai-status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          {data.available ? "AI is set up" : "AI isn't set up yet"}
        </CardTitle>
        <CardDescription>
          {data.available
            ? `Your AI requests use ${data.source === "user" ? "your own" : "the organisation's"} ${data.providerLabel} key with ${data.model}.`
            : data.storageReady
              ? "No AI key has been added. Add one below, or ask your organisation's admin to add one."
              : "The server isn't configured to store AI keys yet (AI_KEYS_SECRET is missing)."}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
