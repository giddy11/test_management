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
import { useCreateCase, useUpdateCase } from "@/hooks/useCases"
import {
  caseSchema,
  csvToArray,
  linesToArray,
  type CaseForm,
} from "@/lib/testMgmtValidation"
import { TC_PRIORITIES, TC_STATUSES, type TcPriority, type TcStatus } from "@/lib/enums"
import { ApiError } from "@/transport/http"
import type { TestCase } from "@/types/testMgmt.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  suiteId: string
  editing: TestCase | null
}

export function CaseFormDialog({ open, onOpenChange, suiteId, editing }: Props) {
  const create = useCreateCase()
  const update = useUpdateCase()
  const isEdit = Boolean(editing)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CaseForm>({
    resolver: zodResolver(caseSchema),
    defaultValues: { priority: "Medium", status: "Draft" },
  })

  useEffect(() => {
    if (open) {
      reset({
        title: editing?.title ?? "",
        description: editing?.description ?? "",
        stepsText: editing?.steps?.join("\n") ?? "",
        expectedResult: editing?.expectedResult ?? "",
        priority: (editing?.priority ?? "Medium") as TcPriority,
        status: (editing?.status ?? "Draft") as TcStatus,
        tagsText: editing?.tags?.join(", ") ?? "",
      })
    }
  }, [open, editing, reset])

  const priority = watch("priority")
  const status = watch("status")

  const onSubmit = (values: CaseForm) => {
    const steps = linesToArray(values.stepsText)
    const tags = values.tagsText ? csvToArray(values.tagsText) : undefined
    const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Failed")
    const done = (msg: string) => () => {
      toast.success(msg)
      onOpenChange(false)
    }

    if (isEdit && editing) {
      update.mutate(
        {
          id: editing.id,
          payload: {
            title: values.title,
            description: values.description || undefined,
            steps,
            expectedResult: values.expectedResult,
            priority: values.priority,
            status: values.status,
            tags: tags ?? [],
          },
        },
        { onError, onSuccess: done("Test case updated") }
      )
    } else {
      create.mutate(
        {
          title: values.title,
          description: values.description || undefined,
          steps,
          expectedResult: values.expectedResult,
          priority: values.priority,
          status: values.status,
          suite: suiteId,
          tags,
        },
        { onError, onSuccess: done("Test case created") }
      )
    }
  }

  const pending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit test case" : "New test case"}</DialogTitle>
          <DialogDescription>Document the steps and expected result so it can be tracked.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <FormField id="title" label="Title" error={errors.title?.message} {...register("title")} />
          <FormField id="description" label="Description (optional)" {...register("description")} />

          <div className="grid gap-1.5">
            <Label htmlFor="stepsText">Steps (one per line)</Label>
            <Textarea id="stepsText" rows={4} placeholder={"Open login page\nEnter valid credentials\nClick submit"} {...register("stepsText")} />
            {errors.stepsText && <p className="text-xs text-destructive">{errors.stepsText.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expectedResult">Expected result</Label>
            <Textarea id="expectedResult" rows={2} {...register("expectedResult")} />
            {errors.expectedResult && <p className="text-xs text-destructive">{errors.expectedResult.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setValue("priority", v as TcPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TC_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setValue("status", v as TcStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <FormField id="tagsText" label="Tags (comma-separated, optional)" placeholder="smoke, regression" {...register("tagsText")} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create test case"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
