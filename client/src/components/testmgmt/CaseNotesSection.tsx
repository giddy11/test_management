import { useState } from "react"
import { Link } from "react-router-dom"
import { StickyNote, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { InlineLoader } from "@/components/shared/PageLoader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { ResultBadge } from "@/components/shared/StatusBadge"
import {
  useCaseNotes,
  useCaseRunNotes,
  useAddCaseNote,
  useDeleteCaseNote,
} from "@/hooks/useCaseNotes"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"
import { timeAgo } from "@/lib/timeAgo"
import { ApiError } from "@/transport/http"

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"

// The running notes thread on the case itself.
export function CaseNotesSection({ caseId }: { caseId: string }) {
  const { user } = useAuth()
  const canModerate = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN
  const { data: notes = [], isLoading } = useCaseNotes(caseId)
  const addNote = useAddCaseNote(caseId)
  const deleteNote = useDeleteCaseNote(caseId)
  const [body, setBody] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)

  const submit = () => {
    if (!body.trim()) return
    addNote.mutate(body.trim(), {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to add note"),
      onSuccess: () => {
        toast.success("Note added")
        setBody("")
      },
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Notes ({notes.length})</h3>

      <div className="space-y-2">
        <Textarea
          rows={3}
          placeholder="Add a note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          data-cy="case-note-input"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={addNote.isPending || !body.trim()} data-cy="case-note-submit">
            {addNote.isPending ? "Adding…" : "Add note"}
          </Button>
        </div>
      </div>

      {isLoading && <InlineLoader className="py-6" />}

      {!isLoading && notes.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
          <StickyNote className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notes on this test case yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {notes.map((n) => {
          // Authors clean up their own notes; admins can remove any.
          const canDelete = canModerate || (n.authorId !== null && n.authorId === user?.id)
          return (
            <div key={n.id} className="flex items-start gap-3" data-cy="case-note">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="text-xs">{initials(n.authorName ?? "?")}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{n.authorName ?? "Deleted user"}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-6 p-0"
                        aria-label="Delete note"
                        onClick={() => setDeleting(n.id)}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete note"
        description="This note will be removed."
        confirmLabel="Delete"
        loading={deleteNote.isPending}
        onConfirm={() =>
          deleting &&
          deleteNote.mutate(deleting, {
            onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
            onSuccess: () => {
              toast.success("Note deleted")
              setDeleting(null)
            },
          })
        }
      />
    </div>
  )
}

// Read-only: notes recorded against this case while executing runs. They're
// written from the run detail page, so there's nothing to add or delete here.
export function RunNotesSection({ caseId, projectId }: { caseId: string; projectId: string }) {
  const { data: notes = [], isLoading } = useCaseRunNotes(caseId)

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Notes from runs ({notes.length})</h3>

      {isLoading && <InlineLoader className="py-6" />}

      {!isLoading && notes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No notes recorded against this case during a test run yet.
        </p>
      )}

      <div className="space-y-3">
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg border bg-muted/30 p-3" data-cy="case-run-note">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/projects/${projectId}/runs/${n.runId}`}
                className="text-sm font-medium hover:underline"
              >
                {n.runName}
              </Link>
              <ResultBadge value={n.status} />
              <span className="ml-auto text-xs text-muted-foreground">
                {n.executedByName ? `${n.executedByName} · ` : ""}
                {n.executedAt ? timeAgo(n.executedAt) : "not executed"}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{n.notes}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
