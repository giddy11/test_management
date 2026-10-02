// modules/project/validators/project.schema.ts
import { z } from "zod";

const { ProjectMemberRole } = require("../../../config/constants");

const memberSchema = z.object({
  userId: z.string().uuid(),
  role: z
    .enum([ProjectMemberRole.MEMBER, ProjectMemberRole.TEAM_LEAD])
    .default(ProjectMemberRole.MEMBER),
});

// E.164 (e.g. "+2348012345678") — same format used elsewhere in the app.
const supportWhatsappNumberSchema = z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number").nullable().optional();

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    members: z.array(memberSchema).max(100).optional(),
  }),
});

export const updateProjectSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      members: z.array(memberSchema).max(100).optional(),
      supportWhatsappNumber: supportWhatsappNumberSchema,
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const fetchProjectsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
  }),
});
