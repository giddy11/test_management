// modules/project/validators/project.schema.js
const { z } = require("zod");

const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    memberIds: z.array(z.string().uuid()).optional(),
  }),
});

const updateProjectSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      memberIds: z.array(z.string().uuid()).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const fetchProjectsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
  }),
});

module.exports = {
  createProjectSchema,
  updateProjectSchema,
  idParamSchema,
  fetchProjectsSchema,
};
