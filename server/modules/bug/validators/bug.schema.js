// modules/bug/validators/bug.schema.js
const { z } = require("zod");
const { enums, BugSeverity, BugPriority } = require("../../../config/constants");

const createBugSchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(3000),
    stepsToReproduce: z.array(z.string().min(1).max(500)).max(30).optional(),
    expectedBehavior: z.string().max(2000).optional(),
    actualBehavior: z.string().max(2000).optional(),
    environment: z.string().max(255).optional(),
    severity: z.enum(enums.bugSeverity).default(BugSeverity.MINOR),
    priority: z.enum(enums.bugPriority).default(BugPriority.MEDIUM),
    testCaseId: z.string().uuid().optional(),
    testRunId: z.string().uuid().optional(),
  }),
});

// One PATCH covers both triage (status/severity/priority/assignee — managers
// only) and correcting the report itself (title … testCaseId — the reporter or
// a manager). The permission split lives in BugService.manageBug. Optional text
// fields are nullable so a mistaken value can be cleared, not just replaced.
const manageBugSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      status: z.enum(enums.bugStatus).optional(),
      severity: z.enum(enums.bugSeverity).optional(),
      priority: z.enum(enums.bugPriority).optional(),
      assignedToId: z.string().uuid().nullable().optional(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().min(1).max(3000).optional(),
      stepsToReproduce: z.array(z.string().min(1).max(500)).max(30).optional(),
      expectedBehavior: z.string().max(2000).nullable().optional(),
      actualBehavior: z.string().max(2000).nullable().optional(),
      environment: z.string().max(255).nullable().optional(),
      testCaseId: z.string().uuid().nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const codeParamSchema = z.object({
  params: z.object({ code: z.string().regex(/^BF-\d+$/i, "Invalid reference code") }),
});

const fetchBugsSchema = z.object({
  query: z.object({
    projectId: z.string().uuid(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(enums.bugStatus).optional(),
    severity: z.enum(enums.bugSeverity).optional(),
    priority: z.enum(enums.bugPriority).optional(),
    assignedToId: z.string().uuid().optional(),
    search: z.string().optional(),
  }),
});

module.exports = {
  createBugSchema,
  manageBugSchema,
  idParamSchema,
  codeParamSchema,
  fetchBugsSchema,
};
