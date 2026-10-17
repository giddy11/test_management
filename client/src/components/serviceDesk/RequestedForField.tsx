// components/serviceDesk/RequestedForField.tsx — who a request is for:
// yourself, a colleague, or a new starter who doesn't have an account yet
// (the "New starter accounts" item is the obvious case).
import { useState } from "react"
import { Check, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useColleagues } from "@/hooks/useServiceDesk"
import { useDebounce } from "@/hooks/useDebounce"
import type { RequestedFor } from "@/lib/serviceDesk"

export function RequestedForField({
  value,
  onChange,
  myId,
  error,
}: {
  value: RequestedFor
  onChange: (v: RequestedFor) => void
  myId: string | undefined
  error?: string
}) {
  const [search, setSearch] = useState("")
  const debounced = useDebounce(search, 250)
  const { data: people = [], isFetching } = useColleagues(debounced, value.mode === "colleague" && !value.person)

  return (
    <div className="grid gap-2">
      <Label>Who is this for?</Label>
      <Tabs
        value={value.mode}
        onValueChange={(m) =>
          onChange(m === "colleague" ? { mode: "colleague", person: null } : m === "new" ? { mode: "new", name: "", email: "" } : { mode: "me" })
        }
      >
        <TabsList>
          <TabsTrigger value="me">Me</TabsTrigger>
          <TabsTrigger value="colleague">A colleague</TabsTrigger>
          <TabsTrigger value="new">A new starter</TabsTrigger>
        </TabsList>
      </Tabs>

      {value.mode === "colleague" &&
        (value.person ? (
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{value.person.name}</span>{" "}
              <span className="text-muted-foreground">{value.person.email}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ mode: "colleague", person: null })}>
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {isFetching && <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>}
              {!isFetching && people.filter((p) => p.id !== myId).length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No colleagues match.</p>
              )}
              {people
                .filter((p) => p.id !== myId)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => onChange({ mode: "colleague", person: p })}
                  >
                    <span>
                      <span className="font-medium">{p.name}</span> <span className="text-muted-foreground">{p.email}</span>
                    </span>
                    <Check className="size-3.5 opacity-0" />
                  </button>
                ))}
            </div>
          </div>
        ))}

      {value.mode === "new" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Full name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
          <Input
            placeholder="Email (if known)"
            type="email"
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
          />
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
