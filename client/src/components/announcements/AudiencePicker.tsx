// components/announcements/AudiencePicker.tsx — who a draft announcement
// targets: everyone, every admin, or a hand-picked list of users.
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useUsers } from "@/hooks/useUsers"

export type BroadcastAudience = "all" | "admins" | "custom"

interface AudiencePickerProps {
  idPrefix: string
  audience: BroadcastAudience
  recipientIds: Set<string>
  onAudienceChange: (audience: BroadcastAudience) => void
  onToggleRecipient: (userId: string) => void
}

export function AudiencePicker({
  idPrefix,
  audience,
  recipientIds,
  onAudienceChange,
  onToggleRecipient,
}: AudiencePickerProps) {
  const [search, setSearch] = useState("")
  const { data } = useUsers({ limit: 100 })
  const users = data?.data ?? []

  const filtered = users.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${idPrefix}-audience`}>Send to</Label>
      <Select value={audience} onValueChange={(v) => onAudienceChange(v as BroadcastAudience)}>
        <SelectTrigger id={`${idPrefix}-audience`} className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All users</SelectItem>
          <SelectItem value="admins">All admins</SelectItem>
          <SelectItem value="custom">Specific users</SelectItem>
        </SelectContent>
      </Select>

      {audience === "custom" && (
        <div className="mt-1 grid gap-2 rounded-md border p-2">
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">No users found.</p>
            )}
            {filtered.map((u) => {
              const initials = `${u.firstName?.[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase()
              return (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent"
                >
                  <Checkbox
                    checked={recipientIds.has(u.id)}
                    onCheckedChange={() => onToggleRecipient(u.id)}
                  />
                  <Avatar className="size-6">
                    <AvatarFallback className="text-[10px]">{initials || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{u.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{u.email}</div>
                  </div>
                </label>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {recipientIds.size > 0
              ? `${recipientIds.size} user${recipientIds.size === 1 ? "" : "s"} selected`
              : "No users selected yet"}
          </p>
        </div>
      )}
    </div>
  )
}
