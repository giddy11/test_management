// components/serviceDesk/DelegationCard.tsx — "Away? Let someone approve for
// you." Each person sets their own stand-in and dates. While it's active, new
// approvals go straight to the stand-in, and they can also decide the ones
// already waiting for you.
import { useState } from "react"
import { CalendarClock } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useClearDelegation, useDelegateCandidates, useMyDelegation, useSetDelegation } from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"

const today = () => new Date().toISOString().slice(0, 10)
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString()

export function DelegationCard() {
  const { data: current, isLoading } = useMyDelegation()
  const [editing, setEditing] = useState(false)
  const { data: people = [] } = useDelegateCandidates(editing)
  const save = useSetDelegation()
  const clear = useClearDelegation()
  const [delegateId, setDelegateId] = useState("")
  const [startsOn, setStartsOn] = useState(today())
  const [endsOn, setEndsOn] = useState(today())
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

  const open = () => {
    setDelegateId(current?.delegateId ?? "")
    setStartsOn(current?.startsOn ?? today())
    setEndsOn(current?.endsOn ?? today())
    setEditing(true)
  }

  const active = current && current.startsOn <= today() && current.endsOn >= today()
  const upcoming = current && current.startsOn > today()

  if (isLoading) return null
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-base"><CalendarClock className="size-4" /> Away?</CardTitle>
          <CardDescription>
            {current && (active || upcoming)
              ? `${current.delegateName} approves for you ${active ? "until" : `from ${fmt(current.startsOn)} to`} ${fmt(current.endsOn)}.`
              : "Name a stand-in to approve IT requests for you while you're away."}
          </CardDescription>
        </div>
        {!editing && (
          <div className="flex gap-2">
            {current && (active || upcoming) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={clear.isPending}
                onClick={() => clear.mutate(undefined, { onSuccess: () => toast.success("You're back — approvals come to you again"), onError: fail })}
              >
                I'm back
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={open}>
              {current && (active || upcoming) ? "Change" : "Set a stand-in"}
            </Button>
          </div>
        )}
      </CardHeader>
      {editing && (
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label>Stand-in</Label>
            <Select value={delegateId} onValueChange={setDelegateId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a colleague" /></SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="del-from">From</Label>
            <Input id="del-from" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="del-to">Until</Label>
            <Input id="del-to" type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <Button
              size="sm"
              disabled={!delegateId || save.isPending}
              onClick={() =>
                save.mutate(
                  { delegateId, startsOn, endsOn, note: null },
                  { onSuccess: () => { toast.success("Stand-in saved"); setEditing(false) }, onError: fail }
                )
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
