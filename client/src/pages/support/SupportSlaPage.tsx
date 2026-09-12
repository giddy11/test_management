// pages/support/SupportSlaPage.tsx — SLA reports for an IT support engineer,
// scoped server-side to their own company's tickets (see SlaService.scopeFor).
import { Gauge } from "lucide-react"
import { SlaDashboard } from "@/components/sla/SlaDashboard"
import { useAuth } from "@/contexts/AuthContext"

export default function SupportSlaPage() {
  const { user } = useAuth()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Gauge className="size-6 text-primary" /> SLA reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Response and resolution performance for {user?.companyName ?? "your company"}'s tickets,
          measured against the product team's SLA rules.
        </p>
      </div>
      <SlaDashboard />
    </div>
  )
}
