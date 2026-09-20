// modules/access/validators/access.schema.js
const { z } = require("zod");

// Permission codes are validated against the live catalog in the service —
// this only rejects anything that isn't shaped like a code at all.
const permissionCode = z
  .string()
  .max(64)
  .regex(/^[a-z]+\.[a-z]+$/, "Expected a lowercase resource.action code");

const roleIdParam = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.any().optional(),
  query: z.any().optional(),
});

const createRoleSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(500).optional(),
      permissions: z.array(permissionCode).max(500).optional(),
      // Start from an existing role's set instead of an empty one.
      cloneFromId: z.string().uuid().optional(),
    })
    .strict(),
  params: z.any().optional(),
  query: z.any().optional(),
});

const updateRoleSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      permissions: z.array(permissionCode).max(500).optional(),
    })
    .strict(),
  query: z.any().optional(),
});

const setUserRolesSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      roleIds: z.array(z.string().uuid()).max(20),
    })
    .strict(),
  query: z.any().optional(),
});

module.exports = {
  roleIdParam,
  createRoleSchema,
  updateRoleSchema,
  setUserRolesSchema,
};
