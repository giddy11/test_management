import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormField } from "@/components/shared/FormField"
import { useSuites } from "@/hooks/useSuites"
import { useCreateRun } from "@/hooks/useRuns"
import { runSchema, type RunForm } from "@/lib/testMgmtValidation"
import { ApiError } from "@/transport/http"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  activeSuiteIds?: string[]
}

export function CreateRunDialog({ open, onOpenChange, projectId, activeSuiteIds = [] }: Props) {
  const navigate = useNavigate()
  const { data: suites = [] } = useSuites(projectId)
  const create = useCreateRun()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RunForm>({ resolver: zodResolver(runSchema) })

  useEffect(() => {
    if (open) {
      const stamp = new Date().toLocaleDateString()
      // Pre-select the suite when it's the only free option — one less click.
      const freeSuites = suites.filter((s) => !activeSuiteIds.includes(s.id))
      reset({ name: `Test run — ${stamp}`, suiteId: freeSuites.length === 1 ? freeSuites[0].id : "" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset, suites])

  const suiteId = watch("suiteId")
  const suiteBusy = Boolean(suiteId) && activeSuiteIds.includes(suiteId)

  const onSubmit = (values: RunForm) => {
    create.mutate(
      { name: values.name, projectId, suiteId: values.suiteId },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: (run) => {
          toast.success("Run created — case snapshot ready")
          onOpenChange(false)
          navigate(`/projects/${projectId}/runs/${run.id}`)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a test run</DialogTitle>
          <DialogDescription>
            Snapshots every test case in the chosen suite so you can record results.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <FormField id="name" label="Run name" data-cy="run-name" error={errors.name?.message} {...register("name")} />
          <div className="grid gap-1.5">
            <Label>Suite</Label>
            <Select value={suiteId} onValueChange={(v) => setValue("suiteId", v, { shouldValidate: true })}>
              <SelectTrigger data-cy="run-suite">
                <SelectValue placeholder={suites.length ? "Select a suite" : "No suites in this project"} />
              </SelectTrigger>
              <SelectContent>
                {suites.map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={activeSuiteIds.includes(s.id)}>
                    {s.name}{activeSuiteIds.includes(s.id) ? " (run in progress)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.suiteId && <p className="text-xs text-destructive">{errors.suiteId.message}</p>}
            {!errors.suiteId && suiteBusy && (
              <p className="text-xs text-destructive">
                This suite already has a run in progress. Complete it before starting another.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              disabled={create.isPending || !suites.length || suiteBusy}
              data-tour="create-run-submit-btn"
              data-cy="run-submit"
            >
              {create.isPending ? "Starting…" : "Start run"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
