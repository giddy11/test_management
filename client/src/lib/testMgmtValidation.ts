import { z } from "zod"
import { TC_PRIORITIES, TC_STATUSES } from "@/lib/enums"

export const suiteSchema = z.object({
  name: z.string().min(1, "Suite name is required").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
})
export type SuiteForm = z.infer<typeof suiteSchema>

// Steps are entered one-per-line in a textarea, tags comma-separated.
export const caseSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional().or(z.literal("")),
  stepsText: z.string().min(1, "Add at least one step"),
  expectedResult: z.string().min(1, "Expected result is required"),
  priority: z.enum(TC_PRIORITIES),
  status: z.enum(TC_STATUSES),
  tagsText: z.string().optional().or(z.literal("")),
})
export type CaseForm = z.infer<typeof caseSchema>

export const runSchema = z.object({
  name: z.string().min(1, "Run name is required").max(200),
  suiteId: z.string().uuid("Pick a suite"),
})
export type RunForm = z.infer<typeof runSchema>

export const linesToArray = (text: string): string[] =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)

export const csvToArray = (text: string): string[] =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
