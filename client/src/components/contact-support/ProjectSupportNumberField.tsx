// components/contact-support/ProjectSupportNumberField.tsx
// Inline "value + Change -> input + Save/Cancel" editor for a project's own
// "Contact support" WhatsApp number — visible to the project's team lead (or
// project.manageall) on the project page. Mirrors the rename-in-place pattern
// used for a test run's name.
import { useState } from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PhoneNumberInput } from "@/components/shared/PhoneNumberInput"
import { useUpdateProject } from "@/hooks/useProjects"
import { ApiError } from "@/transport/http"

interface Props {
  projectId: string
  value: string | null
}

const E164_REGEX = /^\+[1-9]\d{6,14}$/

export function ProjectSupportNumberField({ projectId, value }: Props) {
  const updateProject = useUpdateProject()
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState("")

  const startEditing = () => {
    setInput(value ?? "")
    setEditing(true)
  }

  const save = () => {
    const trimmed = input.trim()
    if (!E164_REGEX.test(trimmed)) {
      toast.error("Enter a number in international format, e.g. +2348012345678")
      return
    }
    updateProject.mutate(
      { id: projectId, payload: { supportWhatsappNumber: trimmed } },
      {
        onSuccess: () => {
          toast.success("WhatsApp support number updated")
          setEditing(false)
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't update the number"),
      }
    )
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <PhoneNumberInput value={input} onChange={setInput} className="w-72" />
        <Button type="submit" size="sm" disabled={updateProject.isPending || !input.trim()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    )
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>
          Contact support WhatsApp number: <span className="text-foreground">{value ?? "Not set"}</span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 p-0"
          aria-label="Change contact support WhatsApp number"
          onClick={startEditing}
        >
          <Pencil className="size-3" />
        </Button>
      </div>
      {!value && (
        <p className="text-xs text-muted-foreground">
          Until this is set, your team won't see a "Contact support" button for this product, and
          it won't appear on your embedded widget either.
        </p>
      )}
    </div>
  )
}
