// components/layout/PreviewBanner.tsx — persistent notice shown on every page
// while an admin/superadmin is previewing the app as a lower role, with an
// always-reachable way back out.
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { ROLE_LABEL } from "@/components/layout/nav"

export function PreviewBanner() {
  const { isPreviewing, previewRole, exitPreview } = useAuth()

  if (!isPreviewing || !previewRole) return null

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-amber-500 px-3 text-amber-950">
      <Eye className="size-4 shrink-0" />
      <span className="text-sm font-medium">
        Previewing as {ROLE_LABEL[previewRole]} — some data may still reflect your admin access.
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-6 px-2 text-amber-950 hover:bg-amber-600/30 hover:text-amber-950"
        onClick={exitPreview}
        data-cy="exit-preview-banner"
      >
        Exit preview
      </Button>
    </div>
  )
}
