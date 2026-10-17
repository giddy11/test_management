// components/serviceDesk/setup/AutomationTab.tsx — Catalog setup → Automation
// (serviceautomation.manage): rules, connectors, and the run log.
import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AutomationIntro, AutomationRules } from "@/components/serviceDesk/setup/AutomationRules"
import { AutomationConnectors } from "@/components/serviceDesk/setup/AutomationConnectors"
import { AutomationRuns } from "@/components/serviceDesk/setup/AutomationRuns"

export function AutomationTab() {
  const [tab, setTab] = useState("rules")
  return (
    <div className="space-y-3">
      <AutomationIntro />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="connectors">Connectors</TabsTrigger>
          <TabsTrigger value="runs">Run log</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="pt-2"><AutomationRules /></TabsContent>
        <TabsContent value="connectors" className="pt-2"><AutomationConnectors /></TabsContent>
        <TabsContent value="runs" className="pt-2"><AutomationRuns /></TabsContent>
      </Tabs>
    </div>
  )
}
