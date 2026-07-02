import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormField } from "@/components/shared/FormField"
import { useCreateBug } from "@/hooks/useBugs"
import { useSuites } from "@/hooks/useSuites"
import { useCases } from "@/hooks/useCases"
import { useRuns } from "@/hooks/useRuns"
import { bugSchema, linesToArray, type BugForm } from "@/lib/testMgmtValidation"
import { BUG_SEVERITIES, BUG_PRIORITIES } from "@/lib/enums"
import { ApiError } from "@/transport/http"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

export function BugFormDialog({ open, onOpenChange, projectId }: Props) {
  const create = useCreateBug()
  const { data: suites = [] } = useSuites(projectId)
  const { data: runs = [] } = useRuns(projectId)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BugForm>({ resolver: zodResolver(bugSchema) })

  useEffect(() => {
    if (open) {
      reset({
        title: "",
        description: "",
        stepsToReproduceText: "",
        expectedBehavior: "",
        actualBehavior: "",
        environment: "",
        severity: "Minor",
        priority: "Medium",
        testRunId: "",
        suiteId: "",
        testCaseId: "",
      })
    }
  }, [open, reset])

  const severity = watch("severity")
  const priority = watch("priority")
  const testRunId = watch("testRunId")
  const suiteId = watch("suiteId")
  const testCaseId = watch("testCaseId")

  const { data: casesData } = useCases(suiteId || "")
  const cases = casesData?.data ?? []

  const onSubmit = (values: BugForm) => {
    const stepsToReproduce = values.stepsToReproduceText
      ? linesToArray(values.stepsToReproduceText)
      : undefined
    create.mutate(
      {
        projectId,
        title: values.title,
        description: values.description,
        stepsToReproduce,
        expectedBehavior: values.expectedBehavior || undefined,
        actualBehavior: values.actualBehavior || undefined,
        environment: values.environment || undefined,
        severity: values.severity,
        priority: values.priority,
        testRunId: values.testRunId || undefined,
        testCaseId: values.testCaseId || undefined,
      },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => {
          toast.success("Bug reported")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>Describe the defect so it can be triaged and fixed.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <FormField id="title" label="Title" error={errors.title?.message} {...register("title")} />

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="stepsToReproduceText">Steps to reproduce (optional, one per line)</Label>
            <Textarea
              id="stepsToReproduceText"
              rows={3}
              placeholder={"Go to the login page\nEnter an invalid password\nClick Sign in"}
              {...register("stepsToReproduceText")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="expectedBehavior">Expected behavior (optional)</Label>
              <Textarea id="expectedBehavior" rows={2} {...register("expectedBehavior")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="actualBehavior">Actual behavior (optional)</Label>
              <Textarea id="actualBehavior" rows={2} {...register("actualBehavior")} />
            </div>
          </div>

          <FormField
            id="environment"
            label="Environment (optional)"
            placeholder="Prod / Chrome 125 / Windows 11"
            {...register("environment")}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setValue("severity", v as BugForm["severity"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUG_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setValue("priority", v as BugForm["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUG_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Related test run (optional)</Label>
              <Select
                value={testRunId || "none"}
                onValueChange={(v) => setValue("testRunId", v === "none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {runs.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Related test case (optional)</Label>
              <Select
                value={suiteId || "none"}
                onValueChange={(v) => {
                  setValue("suiteId", v === "none" ? "" : v)
                  setValue("testCaseId", "")
                }}
              >
                <SelectTrigger><SelectValue placeholder="Pick a suite first" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {suiteId && (
            <div className="grid gap-1.5">
              <Label>Test case</Label>
              <Select value={testCaseId || "none"} onValueChange={(v) => setValue("testCaseId", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {cases.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Submitting…" : "Report bug"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
